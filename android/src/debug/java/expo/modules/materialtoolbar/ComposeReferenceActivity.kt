@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialtoolbar

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.FloatingToolbarExitDirection
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.dp

/**
 * Pure Compose reference for the FloatingToolbar settle. No React Native, no probe, no transport:
 * a plain LazyColumn and `FloatingToolbarDefaults.exitAlwaysScrollBehavior()` wired exactly as the
 * Material docs show.
 *
 * It exists to answer one question by eye: does the step in the toolbar's travel come from our
 * pipeline or from Material's own two-phase settle (decay, then a snap that restarts from zero
 * velocity)? Whatever this screen does is the behavior the module is faithful to.
 *
 * Launch it directly, it is not part of the example's navigation:
 *   adb shell am start -n <applicationId>/expo.modules.materialtoolbar.ComposeReferenceActivity
 */
class ComposeReferenceActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // ComposeView rather than activity-compose's setContent, so the reference needs no dependency
    // the module does not already carry.
    setContentView(
      ComposeView(this).apply {
        setContent {
          MaterialTheme {
            ReferenceScreen()
          }
        }
      },
    )
  }
}

@Composable
private fun ReferenceScreen() {
  // Same exit direction the example uses for its bottom toolbar.
  val scrollBehavior = FloatingToolbarDefaults.exitAlwaysScrollBehavior(
    exitDirection = FloatingToolbarExitDirection.Bottom,
  )
  // Same pairing as the example screen: LargeTopAppBar + exitUntilCollapsed, so both chromes are
  // driven by one scroll exactly as the module drives them.
  val topBarBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

  Scaffold(
    topBar = {
      LargeTopAppBar(
        title = { Text("Gallery") },
        scrollBehavior = topBarBehavior,
      )
    },
  ) { innerPadding ->
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(innerPadding)
        // Both behaviors are NestedScrollConnections, so they go on an ancestor of the scrollable.
        // The app bar consumes in pre-scroll and the toolbar in post-scroll, so they coexist on the
        // same chain without competing.
        //
        // `floatingScrollBehavior` is a different thing and is NOT what hooks up scrolling: it is a
        // layout modifier that measures the toolbar to derive offsetLimit and applies the offset at
        // placement, and HorizontalFloatingToolbar applies it itself when given the behavior.
        .nestedScroll(topBarBehavior.nestedScrollConnection)
        .nestedScroll(scrollBehavior),
    ) {
      LazyColumn(modifier = Modifier.fillMaxSize()) {
        items((0 until 300).toList()) { index ->
          Row(index)
        }
      }

      HorizontalFloatingToolbar(
        expanded = true,
        modifier = Modifier
          .align(Alignment.BottomCenter)
          .padding(bottom = 24.dp),
        scrollBehavior = scrollBehavior,
      ) {
        TextButton(onClick = {}) { Text("Albums") }
        TextButton(onClick = {}) { Text("Artists") }
        TextButton(onClick = {}) { Text("Playlists") }
      }
    }
  }
}

@Composable
private fun Row(index: Int) {
  // Flat colored blocks: no network, so the reference renders identically regardless of the
  // emulator's connectivity.
  val tint = REFERENCE_TINTS[index % REFERENCE_TINTS.size]
  Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .height(96.dp)
        .clip(RoundedCornerShape(12.dp))
        .background(tint),
      contentAlignment = Alignment.CenterStart,
    ) {
      Text(text = "  Item $index", color = Color.White)
    }
  }
}

private val REFERENCE_TINTS = listOf(
  Color(0xFF4C6EF5),
  Color(0xFF12B886),
  Color(0xFFF76707),
  Color(0xFFAE3EC9),
  Color(0xFF1098AD),
)
