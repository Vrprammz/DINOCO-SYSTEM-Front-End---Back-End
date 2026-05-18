<?php
/**
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ scripts/openapi-autogen.php                                      │
 * │                                                                  │
 * │ Walks every WP snippet file at repo root, greps `register_rest_  │
 * │ route()` calls, parses namespace + route + methods + permission, │
 * │ and emits a fresh OpenAPI 3.1 spec to                            │
 * │ `docs/api/openapi.generated.yaml`.                               │
 * │                                                                  │
 * │ Purpose: source of truth for ENDPOINT ENUMERATION + drift check  │
 * │ against the manually-maintained `docs/api/openapi.yaml` (which   │
 * │ has richer schemas for selected endpoints).                      │
 * │                                                                  │
 * │ Boss directive 2026-05-15: "10 ✅ ทำ" — auto-gen path approved.   │
 * │                                                                  │
 * │ Usage:                                                           │
 * │   php scripts/openapi-autogen.php                  # write yaml  │
 * │   php scripts/openapi-autogen.php --json           # write JSON  │
 * │   php scripts/openapi-autogen.php --check          # drift exit  │
 * │   php scripts/openapi-autogen.php --verbose        # list all    │
 * │                                                                  │
 * │ Exit codes:                                                      │
 * │   0  OK / wrote spec                                             │
 * │   1  parse error (one or more files)                             │
 * │   2  --check found drift (use for CI gating)                     │
 * │                                                                  │
 * │ Limitations (acceptable for source-of-truth enumeration):        │
 * │   - Regex-based — won't catch endpoints inside dynamic loops     │
 * │   - Permission callback descriptions are best-effort regex match │
 * │   - Schema bodies NOT auto-generated (callers provide via        │
 * │     existing manual openapi.yaml)                                │
 * └──────────────────────────────────────────────────────────────────┘
 */

declare(strict_types=1);

// CLI args
$flag_json    = in_array('--json', $argv, true);
$flag_check   = in_array('--check', $argv, true);
$flag_verbose = in_array('--verbose', $argv, true);

$repo_root = dirname(__DIR__);
$output_yaml = $repo_root . '/docs/api/openapi.generated.yaml';
$output_json = $repo_root . '/docs/api/openapi.generated.json';
$manual_yaml = $repo_root . '/docs/api/openapi.yaml';

if (!is_dir($repo_root . '/docs/api')) {
    @mkdir($repo_root . '/docs/api', 0775, true);
}

/* ──────────────────────────────────────────────────────────────────
 * 1. File discovery — every snippet file at repo root
 *    (excludes node_modules, vendor, openclawminicrm, docs)
 * ────────────────────────────────────────────────────────────────── */

$snippet_files = [];
$rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(
    $repo_root, FilesystemIterator::SKIP_DOTS
));
foreach ($rii as $f) {
    if (!$f->isFile()) continue;
    $path = $f->getPathname();
    $rel = ltrim(substr($path, strlen($repo_root)), '/');
    // Skip non-snippet trees
    if (preg_match('#^(\.git|node_modules|vendor|openclawminicrm|docs|liff-src|dist|tests|scripts|rpi-print-server|brand-voice-extension)/#', $rel)) continue;
    // Match WP snippet naming convention
    $base = basename($path);
    if (strpos($base, '[') !== 0) continue; // Snippets all start with [
    $snippet_files[] = $path;
}
sort($snippet_files);

if ($flag_verbose) {
    fprintf(STDERR, "[autogen] Scanning %d snippet files\n", count($snippet_files));
}

/* ──────────────────────────────────────────────────────────────────
 * 2. Parse register_rest_route() — extract namespace + route + methods
 * ────────────────────────────────────────────────────────────────── */

$paths_by_ns = []; // [ namespace => [ path => [methods => [meta]] ] ]
$parse_errors = [];
$total_routes = 0;

foreach ($snippet_files as $fp) {
    $src = file_get_contents($fp);
    if ($src === false) {
        $parse_errors[] = $fp . ': read failed';
        continue;
    }
    $base = basename($fp);

    // ─ Pre-pass: build symbol table for $variable + CONSTANT namespace literals
    $sym = []; // name => literal string
    // Variable assignments: $ns = 'b2f/v1';   OR   $namespace = "ns";
    if (preg_match_all('/\$([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*[\'"]([^\'"]+)[\'"]/', $src, $vm)) {
        foreach ($vm[1] as $idx => $vname) {
            $vval = $vm[2][$idx];
            // Heuristic: looks like a REST namespace (contains "/v" or matches typical)
            if (preg_match('#^[a-z0-9-]+/v\d+#i', $vval)) {
                $sym['$' . $vname] = $vval;
            }
        }
    }
    // define( 'CONST', 'value' );
    if (preg_match_all('/define\s*\(\s*[\'"]([A-Z_][A-Z0-9_]*)[\'"]\s*,\s*[\'"]([^\'"]+)[\'"]/', $src, $cm)) {
        foreach ($cm[1] as $idx => $cname) {
            $sym[$cname] = $cm[2][$idx];
        }
    }
    // Also handle define( 'X', 'val' ) within if-not-defined guards (same regex catches this)

    // ─ Find register_rest_route calls with balanced-paren extraction
    // (Naive (.*?) breaks on nested arrays — walk char-by-char tracking depth.)
    $offset = 0;
    $matches = ['1' => []];
    while (($pos = strpos($src, 'register_rest_route', $offset)) !== false) {
        // Find opening paren after the function name
        $open = strpos($src, '(', $pos + 19);
        if ($open === false) { $offset = $pos + 19; continue; }
        $depth = 0;
        $end = -1;
        $len = strlen($src);
        $in_string = ''; // '' or "'" or '"'
        for ($i = $open; $i < $len; $i++) {
            $c = $src[$i];
            if ($in_string !== '') {
                if ($c === '\\') { $i++; continue; }
                if ($c === $in_string) $in_string = '';
                continue;
            }
            if ($c === "'" || $c === '"') { $in_string = $c; continue; }
            if ($c === '(') $depth++;
            elseif ($c === ')') {
                $depth--;
                if ($depth === 0) { $end = $i; break; }
            }
        }
        if ($end === -1) break;
        $args_blob = substr($src, $open + 1, $end - $open - 1);
        $matches['1'][] = [$args_blob, $open + 1];
        $offset = $end + 1;
    }
    if (empty($matches['1'])) continue;

    foreach ($matches['1'] as $i => $m) {
        $args_blob = $m[0];
        $offset = $m[1];
        $line_no = substr_count(substr($src, 0, $offset), "\n") + 1;

        // Extract namespace (1st arg = literal string OR $variable OR CONSTANT)
        $namespace = null;
        // a) Literal string
        if (preg_match('/^[\s\n]*([\'"])([^\'"]+)\\1/', $args_blob, $ns_match)) {
            $namespace = $ns_match[2];
            $rest = substr($args_blob, strlen($ns_match[0]));
        }
        // b) $variable
        elseif (preg_match('/^[\s\n]*(\$[a-zA-Z_][a-zA-Z0-9_]*)/', $args_blob, $ns_match)) {
            $sym_key = $ns_match[1];
            if (isset($sym[$sym_key])) {
                $namespace = $sym[$sym_key];
                $rest = substr($args_blob, strlen($ns_match[0]));
            }
        }
        // c) CONSTANT
        elseif (preg_match('/^[\s\n]*([A-Z_][A-Z0-9_]*)/', $args_blob, $ns_match)) {
            $sym_key = $ns_match[1];
            if (isset($sym[$sym_key])) {
                $namespace = $sym[$sym_key];
                $rest = substr($args_blob, strlen($ns_match[0]));
            }
        }
        if ($namespace === null) continue;

        // Strip leading comma
        $rest = ltrim($rest, " \t\n,");

        // Extract route (2nd arg string literal — may contain regex chars)
        if (!preg_match('/^([\'"])((?:[^\'"\\\\]|\\\\.)+)\\1/', $rest, $rt_match)) continue;
        $route = $rt_match[2];
        // Convert WP-style (?P<name>regex) → OpenAPI {name}
        $openapi_path = '/' . trim($namespace, '/') . '/' . ltrim(
            preg_replace('/\(\?P<([a-zA-Z_][a-zA-Z0-9_]*)>[^)]+\)/', '{$1}', $route),
            '/'
        );

        // Extract methods — search for 'methods' => '...' or array(...)
        $methods = [];
        if (preg_match_all('/[\'"]methods[\'"]\s*=>\s*([\'"]([^\'"]+)[\'"]|array\s*\(([^)]+)\)|\[\s*([^\]]+)\s*\])/i', $args_blob, $mm)) {
            foreach ($mm[0] as $idx => $_full) {
                $val = '';
                if (!empty($mm[2][$idx])) $val = $mm[2][$idx];
                elseif (!empty($mm[3][$idx])) $val = $mm[3][$idx];
                elseif (!empty($mm[4][$idx])) $val = $mm[4][$idx];
                // Normalize: extract verbs
                if (preg_match_all('/[\'"]?(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)[\'"]?/i', $val, $vm)) {
                    foreach ($vm[1] as $verb) {
                        $methods[strtolower($verb)] = true;
                    }
                }
            }
        }
        if (empty($methods)) {
            // Default WP behavior if 'methods' omitted = GET
            $methods['get'] = true;
        }

        // Extract permission heuristic
        $permission = 'unknown';
        if (preg_match('/[\'"]permission_callback[\'"]\s*=>\s*[\'"](__return_true|__return_false)[\'"]/', $args_blob, $pm)) {
            $permission = $pm[1] === '__return_true' ? 'public' : 'denied';
        } elseif (preg_match('/[\'"]permission_callback[\'"]\s*=>\s*function/', $args_blob)) {
            // Inline closure — peek for manage_options / current_user_can / nonce
            if (preg_match('/current_user_can\s*\(\s*[\'"]manage_options[\'"]\)/', $args_blob)) {
                $permission = 'admin';
            } elseif (preg_match('/current_user_can\s*\(\s*[\'"]([^\'"]+)[\'"]\)/', $args_blob, $cm)) {
                $permission = 'capability:' . $cm[1];
            } elseif (preg_match('/wp_verify_nonce|is_user_logged_in/', $args_blob)) {
                $permission = 'authenticated';
            } else {
                $permission = 'closure';
            }
        } elseif (preg_match('/[\'"]permission_callback[\'"]\s*=>\s*[\'"]?([a-zA-Z_][a-zA-Z0-9_]*)[\'"]?/', $args_blob, $pm2)) {
            $permission = 'callback:' . $pm2[1];
        }

        // Init structure
        if (!isset($paths_by_ns[$namespace])) $paths_by_ns[$namespace] = [];
        if (!isset($paths_by_ns[$namespace][$openapi_path])) $paths_by_ns[$namespace][$openapi_path] = [];

        foreach (array_keys($methods) as $verb) {
            $paths_by_ns[$namespace][$openapi_path][$verb] = [
                'permission' => $permission,
                'snippet'    => $base,
                'line'       => $line_no,
            ];
            $total_routes++;
        }
    }
}

if ($flag_verbose) {
    fprintf(STDERR, "[autogen] Parsed %d routes across %d namespaces\n",
        $total_routes, count($paths_by_ns));
}

if (!empty($parse_errors)) {
    foreach ($parse_errors as $err) fprintf(STDERR, "[autogen] ERROR: %s\n", $err);
    exit(1);
}

/* ──────────────────────────────────────────────────────────────────
 * 3. Build OpenAPI 3.1 spec
 * ────────────────────────────────────────────────────────────────── */

$spec = [
    'openapi' => '3.1.0',
    'info' => [
        'title'   => 'DINOCO REST API (auto-generated)',
        'version' => '1.0.0-autogen',
        'description' => sprintf(
            "AUTO-GENERATED by `scripts/openapi-autogen.php` on %s.\n\n" .
            "Total routes: **%d** across **%d** namespaces.\n\n" .
            "**Source of truth**: walks `register_rest_route()` calls across all WP snippets.\n" .
            "**Schemas**: this auto-spec lists endpoints + permissions + source location only.\n" .
            "For request/response schemas, see manually-curated `docs/api/openapi.yaml`.\n\n" .
            "**Drift detection**: run with `--check` to exit-2 if generated set differs from this file.",
            gmdate('Y-m-d H:i:s') . ' UTC',
            $total_routes,
            count($paths_by_ns)
        ),
    ],
    'servers' => [
        [
            'url'         => 'https://dinoco.in.th',
            'description' => 'Production',
        ],
    ],
    'tags'  => [],
    'paths' => [],
    'components' => [
        'securitySchemes' => [
            'wpNonce' => [
                'type'        => 'apiKey',
                'in'          => 'header',
                'name'        => 'X-WP-Nonce',
                'description' => 'WordPress REST nonce (wp_rest action)',
            ],
            'liffAiBearer' => [
                'type'   => 'http',
                'scheme' => 'bearer',
                'description' => 'JWT issued by /liff-ai/v1/auth',
            ],
            'b2fAdminToken' => [
                'type' => 'apiKey',
                'in'   => 'header',
                'name' => 'X-B2F-Token',
                'description' => 'HMAC-signed admin LIFF session token',
            ],
            'basicAuth' => [
                'type'   => 'http',
                'scheme' => 'basic',
                'description' => 'RPi print daemon basic auth',
            ],
        ],
    ],
];

// Build tags (one per namespace)
foreach (array_keys($paths_by_ns) as $ns) {
    $spec['tags'][] = [
        'name'        => $ns,
        'description' => sprintf('%d routes', array_sum(array_map('count', $paths_by_ns[$ns] ?? []))),
    ];
}

// Build paths
ksort($paths_by_ns);
foreach ($paths_by_ns as $ns => $routes) {
    ksort($routes);
    foreach ($routes as $path => $verbs) {
        if (!isset($spec['paths'][$path])) $spec['paths'][$path] = [];
        foreach ($verbs as $verb => $meta) {
            $op = [
                'tags'        => [$ns],
                'summary'     => sprintf('%s %s', strtoupper($verb), $path),
                'description' => sprintf(
                    "Source: `%s:%d`\n\nPermission: `%s`",
                    $meta['snippet'], $meta['line'], $meta['permission']
                ),
                'responses'   => [
                    '200' => ['description' => 'Success'],
                    '4XX' => ['description' => 'Client error (WP_Error envelope)'],
                    '5XX' => ['description' => 'Server error'],
                ],
            ];
            // Path parameters extracted from {name} placeholders
            if (preg_match_all('/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/', $path, $pm)) {
                $params = [];
                foreach (array_unique($pm[1]) as $pname) {
                    $params[] = [
                        'name'     => $pname,
                        'in'       => 'path',
                        'required' => true,
                        'schema'   => ['type' => 'string'],
                    ];
                }
                $op['parameters'] = $params;
            }
            // Security inference
            switch ($meta['permission']) {
                case 'admin':
                case 'capability:manage_options':
                    $op['security'] = [['wpNonce' => []]];
                    break;
                case 'public':
                    // no security entry
                    break;
                default:
                    $op['security'] = [['wpNonce' => []], ['liffAiBearer' => []], ['b2fAdminToken' => []]];
            }
            $spec['paths'][$path][$verb] = $op;
        }
    }
}

/* ──────────────────────────────────────────────────────────────────
 * 4. Drift check mode
 * ────────────────────────────────────────────────────────────────── */

if ($flag_check) {
    if (!file_exists($output_yaml)) {
        fprintf(STDERR, "[autogen] --check: no existing %s — first run, treating as drift\n", basename($output_yaml));
        exit(2);
    }
    $new_yaml = build_yaml($spec);
    $existing = file_get_contents($output_yaml);
    // Strip the "generated on" timestamp line for fair compare
    $strip_ts = function($s) {
        return preg_replace('/AUTO-GENERATED by .*? on .*? UTC\./', 'AUTO-GENERATED ...', $s);
    };
    if ($strip_ts($new_yaml) !== $strip_ts($existing)) {
        fprintf(STDERR, "[autogen] DRIFT detected. Run without --check to update.\n");
        // Compare key counts to surface actionable info
        $existing_routes = preg_match_all('/^    (?:get|post|put|delete|patch|options|head):$/m', $existing);
        $new_routes      = preg_match_all('/^    (?:get|post|put|delete|patch|options|head):$/m', $new_yaml);
        fprintf(STDERR, "[autogen] Existing routes: %d  New routes: %d\n", $existing_routes, $new_routes);
        exit(2);
    }
    fprintf(STDERR, "[autogen] --check: no drift (matches existing %s)\n", basename($output_yaml));
    exit(0);
}

/* ──────────────────────────────────────────────────────────────────
 * 5. Emit YAML (and optionally JSON)
 * ────────────────────────────────────────────────────────────────── */

$yaml = build_yaml($spec);
file_put_contents($output_yaml, $yaml);
fprintf(STDERR, "[autogen] Wrote %s (%d routes, %d namespaces, %d bytes)\n",
    $output_yaml, $total_routes, count($paths_by_ns), strlen($yaml));

if ($flag_json) {
    $json = json_encode($spec, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    file_put_contents($output_json, $json);
    fprintf(STDERR, "[autogen] Wrote %s (%d bytes)\n", $output_json, strlen($json));
}

// Print summary by namespace
fprintf(STDERR, "\n[autogen] Summary by namespace:\n");
foreach ($paths_by_ns as $ns => $routes) {
    $verb_count = 0;
    foreach ($routes as $verbs) $verb_count += count($verbs);
    fprintf(STDERR, "  %-40s %3d paths %3d operations\n", $ns, count($routes), $verb_count);
}

exit(0);

/* ──────────────────────────────────────────────────────────────────
 * Minimal YAML emitter (good enough for OpenAPI — handles nesting,
 * strings, arrays, no complex anchor/alias/multiline) — kept inline
 * to avoid composer dependency on symfony/yaml in WP env.
 * ────────────────────────────────────────────────────────────────── */
function build_yaml(array $data, int $indent = 0): string {
    $out = '';
    $pad = str_repeat('  ', $indent);
    $is_list_context = yaml_is_indexed_list($data);
    foreach ($data as $k => $v) {
        // List items use "-" prefix; map items use "key:" (cast int → str for map)
        $key = $is_list_context ? '-' : yaml_key((string)$k) . ':';
        if (is_array($v)) {
            if (empty($v)) {
                $out .= $pad . ($is_list_context ? '- []' : $key . ' []') . "\n";
            } elseif ($is_list_context) {
                // List item containing a map: "- key: value"
                $sub = build_yaml($v, $indent + 1);
                // Replace first line indent with "-"
                $lines = explode("\n", rtrim($sub, "\n"));
                $first = ltrim($lines[0]);
                $out .= $pad . '- ' . $first . "\n";
                for ($i = 1; $i < count($lines); $i++) {
                    $out .= $pad . '  ' . ltrim($lines[$i]) . "\n";
                }
            } elseif (yaml_is_indexed_list($v)) {
                // Indexed list (all keys are integers AND 0..n-1)
                $out .= $pad . $key . "\n";
                foreach ($v as $item) {
                    if (is_scalar($item)) {
                        $out .= $pad . '  - ' . yaml_scalar((string)$item) . "\n";
                    } else {
                        $out .= build_yaml([$item], $indent + 1);
                    }
                }
            } else {
                $out .= $pad . $key . "\n";
                $out .= build_yaml($v, $indent + 1);
            }
        } else {
            // Pass child-pad for proper block-scalar indent
            $out .= $pad . $key . ' ' . yaml_scalar((string)$v, $indent + 1) . "\n";
        }
    }
    return $out;
}

function yaml_is_indexed_list(array $v): bool {
    if (empty($v)) return false;
    $keys = array_keys($v);
    // Only treat as sequence if EVERY key is a true integer (not string '200')
    foreach ($keys as $k) { if (!is_int($k)) return false; }
    // And keys are exactly 0..n-1
    return $keys === range(0, count($v) - 1);
}

function yaml_key(string $k): string {
    // Quote keys containing special chars
    if (preg_match('/[:{}\[\],&*#?|<>=!%@`]/', $k) || $k === '') {
        return "'" . str_replace("'", "''", $k) . "'";
    }
    return $k;
}

function yaml_scalar(string $s, int $child_indent = 0): string {
    if ($s === '') return "''";
    // Multiline → block scalar (literal style "|")
    if (strpos($s, "\n") !== false) {
        $lines = explode("\n", $s);
        $pad = str_repeat('  ', max(1, $child_indent));
        $block = "|\n";
        foreach ($lines as $line) {
            $block .= $pad . $line . "\n";
        }
        return rtrim($block, "\n");
    }
    // Quote if contains YAML-special chars OR looks like a number/bool/null
    if (preg_match('/^[-+]?[0-9]+(\.[0-9]+)?$/', $s)
     || in_array(strtolower($s), ['true', 'false', 'null', 'yes', 'no', '~'], true)
     || preg_match('/[:#&*!|>"\'%@`]/', $s)
     || $s[0] === ' ' || substr($s, -1) === ' ') {
        return "'" . str_replace("'", "''", $s) . "'";
    }
    return $s;
}
