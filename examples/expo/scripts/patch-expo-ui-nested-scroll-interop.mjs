import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, '..');
const requireFromExample = createRequire(path.join(exampleRoot, 'package.json'));
const packageRoots = new Set();

function addPackageRoot(candidate, reason, logExisting = false) {
  if (!candidate || !fs.existsSync(candidate)) return;
  const resolved = fs.realpathSync(candidate);
  const isNew = !packageRoots.has(resolved);
  packageRoots.add(resolved);
  if (isNew || logExisting) {
    console.log(`[expo-ui-poc] ${reason}: ${resolved}`);
  }
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
    const output = execFileSync(
      autolinkingBin,
      ['search', '--platform', 'android', '--json', '--project-root', exampleRoot],
      {
        cwd: exampleRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const searchResult = JSON.parse(output);
    const expoUi = searchResult['@expo/ui'];
    addPackageRoot(expoUi?.path, 'autolink-resolved @expo/ui', true);
    for (const duplicate of expoUi?.duplicates ?? []) {
      addPackageRoot(duplicate?.path, 'autolink duplicate @expo/ui', true);
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
  let changed = false;

  if (!source.includes('EXPO_UI_LAZY_INTEROP attached')) {
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

    const transactionMarker =
      '    val padding = props.contentPadding.value\n\n' +
      '    LazyColumn(\n' +
      '      modifier = ModifierRegistry.applyModifiers(props.modifiers.value, appContext, this@Content, globalEventDispatcher),\n';

    if (!source.includes(transactionMarker)) {
      throw new Error(`[expo-ui-poc] SDK 57 transaction marker changed at ${target}`);
    }

    const transactionReplacement =
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

    source = source.replace(transactionMarker, transactionReplacement);
    changed = true;
  }

  if (!source.includes('EXPO_UI_LAZY_INTEROP_GEOMETRY_V5 attached')) {
    source = ensureImport(source, 'import androidx.compose.ui.platform.LocalDensity', 'import androidx.compose.ui.platform.rememberNestedScrollInteropConnection\n');
    source = ensureImport(source, 'import androidx.compose.runtime.mutableFloatStateOf', 'import androidx.compose.runtime.mutableIntStateOf\n');
    source = ensureImport(source, 'import androidx.compose.ui.unit.Dp', 'import androidx.compose.ui.unit.Velocity\n');
    source = ensureImport(source, 'import androidx.compose.ui.unit.LayoutDirection', 'import androidx.compose.ui.unit.Velocity\n');
    source = ensureImport(source, 'import java.util.function.BiConsumer', 'import expo.modules.kotlin.AppContext\n');

    const stateMarker =
      '  private val composableChildCount: MutableIntState = mutableIntStateOf(0)\n';
    if (!source.includes(stateMarker)) {
      throw new Error(`[expo-ui-poc] SDK 57 geometry state marker changed at ${target}`);
    }
    const geometryStateBlock =
      '  private val nestedScrollInteropExpandedHeightPx = mutableIntStateOf(0)\n' +
      '  private val nestedScrollInteropCollapseAmountPx = mutableFloatStateOf(0f)\n' +
      '  private val nestedScrollInteropGeometryTagId = resources.getIdentifier(\n' +
      '    "react_native_scroll_interop_compose_geometry_sink",\n' +
      '    "id",\n' +
      '    context.packageName\n' +
      '  )\n' +
      '  private val nestedScrollInteropGeometrySink = BiConsumer<Int, Float> { expandedHeightPx, collapseAmountPx ->\n' +
      '    val expanded = expandedHeightPx.coerceAtLeast(0)\n' +
      '    nestedScrollInteropExpandedHeightPx.intValue = expanded\n' +
      '    nestedScrollInteropCollapseAmountPx.floatValue = collapseAmountPx.coerceIn(0f, expanded.toFloat())\n' +
      '  }\n' +
      '  private var nestedScrollInteropGeometryOwner: View? = null\n\n' +
      '  override fun onAttachedToWindow() {\n' +
      '    super.onAttachedToWindow()\n' +
      '    val owner = findNestedScrollInteropHost()\n' +
      '    nestedScrollInteropGeometryOwner = owner\n' +
      '    if (nestedScrollInteropGeometryTagId != 0 && owner != null) {\n' +
      '      owner.setTag(nestedScrollInteropGeometryTagId, nestedScrollInteropGeometrySink)\n' +
      '      Log.d("ReactNativeScrollInterop", "EXPO_UI_LAZY_INTEROP_GEOMETRY_V5 attached owner=HostView")\n' +
      '    } else {\n' +
      '      Log.e("ReactNativeScrollInterop", "EXPO_UI_LAZY_INTEROP_GEOMETRY_V5 missing-host-or-tag")\n' +
      '    }\n' +
      '  }\n\n' +
      '  override fun onDetachedFromWindow() {\n' +
      '    val owner = nestedScrollInteropGeometryOwner\n' +
      '    if (nestedScrollInteropGeometryTagId != 0 &&\n' +
      '      owner?.getTag(nestedScrollInteropGeometryTagId) === nestedScrollInteropGeometrySink\n' +
      '    ) {\n' +
      '      owner.setTag(nestedScrollInteropGeometryTagId, null)\n' +
      '    }\n' +
      '    nestedScrollInteropGeometryOwner = null\n' +
      '    super.onDetachedFromWindow()\n' +
      '  }\n\n' +
      '  private fun findNestedScrollInteropHost(): HostView? {\n' +
      '    var current = parent as? View\n' +
      '    while (current != null) {\n' +
      '      if (current is HostView) return current\n' +
      '      current = current.parent as? View\n' +
      '    }\n' +
      '    return null\n' +
      '  }\n';

    const existingGeometryStart = source.indexOf(
      '  private val nestedScrollInteropExpandedHeightPx'
    );
    if (existingGeometryStart >= 0) {
      const nextMethod = source.indexOf('  override fun onViewAdded', existingGeometryStart);
      if (nextMethod < 0) {
        throw new Error(`[expo-ui-poc] SDK 57 geometry upgrade marker changed at ${target}`);
      }
      source =
        source.slice(0, existingGeometryStart) +
        geometryStateBlock +
        '\n' +
        source.slice(nextMethod);
    } else {
      source = source.replace(stateMarker, `${stateMarker}\n${geometryStateBlock}`);
    }

    const legacyPaddingBlock =
      '    val density = LocalDensity.current\n' +
      '    val nestedScrollInteropTopPadding = with(density) {\n' +
      '      (nestedScrollInteropExpandedHeightPx.intValue - nestedScrollInteropCollapseAmountPx.intValue)\n' +
      '        .coerceAtLeast(0)\n' +
      '        .toDp()\n' +
      '    }\n';
    source = source.replace(legacyPaddingBlock, '');

    if (!source.includes('val nestedScrollInteropPadding = remember(padding, density)')) {
      const paddingMarker = '    val padding = props.contentPadding.value\n';
      if (!source.includes(paddingMarker)) {
        throw new Error(`[expo-ui-poc] SDK 57 geometry padding marker changed at ${target}`);
      }
      const paddingReplacement =
        `${paddingMarker}` +
        '    val density = LocalDensity.current\n' +
        '    val nestedScrollInteropPadding = remember(padding, density) {\n' +
        '      object : PaddingValues {\n' +
        '        override fun calculateLeftPadding(layoutDirection: LayoutDirection): Dp =\n' +
        '          if (layoutDirection == LayoutDirection.Ltr) (padding?.start ?: 0).dp else (padding?.end ?: 0).dp\n\n' +
        '        override fun calculateTopPadding(): Dp {\n' +
        '          val visibleChromeHeightPx = (\n' +
        '            nestedScrollInteropExpandedHeightPx.intValue.toFloat() -\n' +
        '              nestedScrollInteropCollapseAmountPx.floatValue\n' +
        '            ).coerceAtLeast(0f)\n' +
        '          return (padding?.top ?: 0).dp + with(density) { visibleChromeHeightPx.toDp() }\n' +
        '        }\n\n' +
        '        override fun calculateRightPadding(layoutDirection: LayoutDirection): Dp =\n' +
        '          if (layoutDirection == LayoutDirection.Ltr) (padding?.end ?: 0).dp else (padding?.start ?: 0).dp\n\n' +
        '        override fun calculateBottomPadding(): Dp = (padding?.bottom ?: 0).dp\n' +
        '      }\n' +
        '    }\n';
      source = source.replace(paddingMarker, paddingReplacement);
    }

    const legacyContentPadding =
      '      contentPadding = PaddingValues(\n' +
      '        start = (padding?.start ?: 0).dp,\n' +
      '        top = (padding?.top ?: 0).dp + nestedScrollInteropTopPadding,\n' +
      '        end = (padding?.end ?: 0).dp,\n' +
      '        bottom = (padding?.bottom ?: 0).dp\n' +
      '      )\n';
    const originalContentPadding =
      '      contentPadding = PaddingValues(\n' +
      '        start = (padding?.start ?: 0).dp,\n' +
      '        top = (padding?.top ?: 0).dp,\n' +
      '        end = (padding?.end ?: 0).dp,\n' +
      '        bottom = (padding?.bottom ?: 0).dp\n' +
      '      )\n';
    if (source.includes(legacyContentPadding)) {
      source = source.replace(legacyContentPadding, '      contentPadding = nestedScrollInteropPadding\n');
    } else if (source.includes(originalContentPadding)) {
      source = source.replace(originalContentPadding, '      contentPadding = nestedScrollInteropPadding\n');
    } else if (!source.includes('contentPadding = nestedScrollInteropPadding')) {
      throw new Error(`[expo-ui-poc] SDK 57 content padding marker changed at ${target}`);
    }
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(target, source);
    console.log(`[expo-ui-poc] patched LazyColumn transaction + geometry interop: ${target}`);
  } else {
    console.log(`[expo-ui-poc] LazyColumn transaction + geometry interop already patched: ${target}`);
  }
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
  const installedSource = fs.readFileSync(target, 'utf8');
  const requiredMarkers = [
    'EXPO_UI_LAZY_INTEROP attached',
    'EXPO_UI_LAZY_INTEROP_GEOMETRY_V5 attached',
    'override fun onDetachedFromWindow()',
    '.nestedScroll(tracedInterop)',
    'contentPadding = nestedScrollInteropPadding',
  ];
  for (const marker of requiredMarkers) {
    if (!installedSource.includes(marker)) {
      throw new Error(`[expo-ui-poc] patch verification failed (${marker}): ${target}`);
    }
  }
}

console.log(`[expo-ui-poc] verified ${patchedRoots.length} Expo UI native package path(s)`);
