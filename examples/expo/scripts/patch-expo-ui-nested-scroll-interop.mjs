import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, '..');

const packageRoots = [
  path.join(exampleRoot, 'node_modules', '@expo', 'ui'),
  path.join(exampleRoot, 'node_modules', 'expo-router', 'node_modules', '@expo', 'ui'),
].filter((candidate) => fs.existsSync(candidate));

if (packageRoots.length === 0) {
  throw new Error(
    'Expo UI was not found. Install examples/expo dependencies before running this POC.'
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
    console.log(`[expo-ui-poc] LazyColumn interop already patched at ${path.relative(exampleRoot, target)}`);
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
  console.log(`[expo-ui-poc] patched LazyColumn interop at ${path.relative(exampleRoot, target)}`);
  return true;
}

const patched = packageRoots.map(patchLazyColumn).filter(Boolean);
if (patched.length === 0) {
  throw new Error('Expo UI LazyColumnView.kt was not found in any installed @expo/ui copy.');
}

console.log(`[expo-ui-poc] patched ${patched.length} installed Expo UI copy/copies`);
