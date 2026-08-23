import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, '..');
const requireFromExample = createRequire(path.join(exampleRoot, 'package.json'));
const packageRoots = new Set();

function addPackageRoot(candidate, reason) {
  if (!candidate || !fs.existsSync(candidate)) return;
  const resolved = fs.realpathSync(candidate);
  packageRoots.add(resolved);
  console.log(`[expo-ui-poc] ${reason}: ${resolved}`);
}

// First use Node's own resolution from the example app. This should match Metro's package choice.
try {
  const packageJsonPath = requireFromExample.resolve('@expo/ui/package.json');
  addPackageRoot(path.dirname(packageJsonPath), 'node-resolved @expo/ui');
} catch (error) {
  console.warn(`[expo-ui-poc] Node could not resolve @expo/ui: ${error.message}`);
}

// Then ask Expo Autolinking which native package path it discovered. This is the important one for Gradle.
const autolinkingBin = path.join(
  exampleRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'expo-modules-autolinking.cmd' : 'expo-modules-autolinking'
);

if (fs.existsSync(autolinkingBin)) {
  try {
    const output = execFileSync(autolinkingBin, ['search'], {
      cwd: exampleRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const searchResult = JSON.parse(output);
    const expoUi = searchResult['@expo/ui'];
    addPackageRoot(expoUi?.path, 'autolink-resolved @expo/ui');
    for (const duplicate of expoUi?.duplicates ?? []) {
      addPackageRoot(duplicate?.path, 'autolink duplicate @expo/ui');
    }
  } catch (error) {
    console.warn(`[expo-ui-poc] Expo Autolinking search failed: ${error.message}`);
  }
} else {
  console.warn(`[expo-ui-poc] Expo Autolinking binary not found at ${autolinkingBin}`);
}

// Keep explicit fallbacks for SDK 57 layouts where @expo/ui is hoisted or nested under expo-router.
addPackageRoot(path.join(exampleRoot, 'node_modules', '@expo', 'ui'), 'top-level fallback');
addPackageRoot(
  path.join(exampleRoot, 'node_modules', 'expo-router', 'node_modules', '@expo', 'ui'),
  'expo-router fallback'
);

if (packageRoots.size === 0) {
  throw new Error(
    'Expo UI was not found. Run npm install in examples/expo before running this POC.'
  );
}

function ensureImport(source, line, marker) {
  if (source.includes(`${line}\n`)) return source;
  if (!source.includes(marker)) {
    throw new Error(`[expo-ui-poc] import marker changed while adding ${line}`);
  }
  return source.replace(marker, `${line}\n${marker}`);
}

function patchLazyColumn(packageRoot) {
  const target = path.join(
    packageRoot,
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'ui',
    'LazyColumnView.kt'
  );
  if (!fs.existsSync(target)) return false;

  let source = fs.readFileSync(target, 'utf8');
  if (source.includes('EXPO_UI_LAZY_INTEROP attached')) {
    console.log(`[expo-ui-poc] LazyColumn interop already patched: ${target}`);
    return true;
  }

  source = ensureImport(source, 'import android.util.Log', 'import android.view.View\n');
  source = ensureImport(source, 'import androidx.compose.runtime.remember', 'import androidx.compose.runtime.mutableStateOf\n');
  source = ensureImport(source, 'import androidx.compose.ui.geometry.Offset', 'import androidx.compose.ui.Alignment\n');
  source = ensureImport(
    source,
    'import androidx.compose.ui.input.nestedscroll.NestedScrollConnection',
    'import androidx.compose.ui.unit.dp\n'
  );
  source = ensureImport(
    source,
    'import androidx.compose.ui.input.nestedscroll.NestedScrollSource',
    'import androidx.compose.ui.unit.dp\n'
  );
  source = ensureImport(
    source,
    'import androidx.compose.ui.input.nestedscroll.nestedScroll',
    'import androidx.compose.ui.unit.dp\n'
  );
  source = ensureImport(
    source,
    'import androidx.compose.ui.platform.rememberNestedScrollInteropConnection',
    'import androidx.compose.ui.unit.dp\n'
  );
  source = ensureImport(source, 'import androidx.compose.ui.unit.Velocity', 'import androidx.compose.ui.unit.dp\n');

  const marker =
    '    val padding = props.contentPadding.value\n\n' +
    '    LazyColumn(\n' +
    '      modifier = ModifierRegistry.applyModifiers(props.modifiers.value, appContext, this@Content, globalEventDispatcher),\n';

  if (!source.includes(marker)) {
    throw new Error(`[expo-ui-poc] SDK 57 LazyColumnView marker changed at ${target}`);
  }

  const replacement =
    '    val padding = props.contentPadding.value\n\n' +
    '    val interop = rememberNestedScrollInteropConnection()\n' +
    '    val tracedInterop = remember(interop) {\n' +
    '      object : NestedScrollConnection {\n' +
    '        override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {\n' +
    '          Log.d("ReactNativeScrollInterop", "EXPO_UI_LAZY_INTEROP pre availableY=${available.y} source=$source")\n' +
    '          return interop.onPreScroll(available, source)\n' +
    '        }\n\n' +
    '        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {\n' +
    '          Log.d("ReactNativeScrollInterop", "EXPO_UI_LAZY_INTEROP post consumedY=${consumed.y} availableY=${available.y} source=$source")\n' +
    '          return interop.onPostScroll(consumed, available, source)\n' +
    '        }\n\n' +
    '        override suspend fun onPreFling(available: Velocity): Velocity {\n' +
    '          Log.d("ReactNativeScrollInterop", "EXPO_UI_LAZY_INTEROP preFling y=${available.y}")\n' +
    '          return interop.onPreFling(available)\n' +
    '        }\n\n' +
    '        override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {\n' +
    '          Log.d("ReactNativeScrollInterop", "EXPO_UI_LAZY_INTEROP postFling consumedY=${consumed.y} availableY=${available.y}")\n' +
    '          return interop.onPostFling(consumed, available)\n' +
    '        }\n' +
    '      }\n' +
    '    }\n' +
    '    Log.d("ReactNativeScrollInterop", "EXPO_UI_LAZY_INTEROP attached")\n\n' +
    '    LazyColumn(\n' +
    '      modifier = ModifierRegistry.applyModifiers(props.modifiers.value, appContext, this@Content, globalEventDispatcher)\n' +
    '        .nestedScroll(tracedInterop),\n';

  source = source.replace(marker, replacement);
  fs.writeFileSync(target, source);
  console.log(`[expo-ui-poc] patched LazyColumn interop: ${target}`);
  return true;
}

const patchedRoots = [...packageRoots].filter(patchLazyColumn);
if (patchedRoots.length === 0) {
  throw new Error('Expo UI LazyColumnView.kt was not found in any resolved @expo/ui package.');
}

for (const packageRoot of patchedRoots) {
  const target = path.join(
    packageRoot,
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'ui',
    'LazyColumnView.kt'
  );
  const verified = fs.readFileSync(target, 'utf8').includes('EXPO_UI_LAZY_INTEROP attached');
  if (!verified) throw new Error(`[expo-ui-poc] patch verification failed: ${target}`);
}

console.log(`[expo-ui-poc] verified ${patchedRoots.length} Expo UI native package path(s)`);
