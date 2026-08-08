package com.materialtoolbar.views

/**
 * One toolbar action, in a shape neither binding is special about.
 *
 * The Expo binding builds these from an `expo.modules.kotlin.records.Record`; the bare React
 * Native binding builds them from a `ReadableMap`. Keeping the host view on this plain type is
 * what allows both to exist without duplicating the Compose layer.
 */
data class ToolbarActionSpec(
  val id: String = "",
  val presentation: String = "icon",
  val label: String = "",
  val enabled: Boolean = true,
  val accessibilityLabel: String? = null,
  val iconPresent: Boolean = false,
  val iconUri: String? = null,
  val iconTintable: Boolean = true,
  val iconSize: Double = 24.0,
  val iconFallback: String = "none",
  val selected: Boolean = false,
)
