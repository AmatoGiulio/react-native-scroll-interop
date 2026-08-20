package com.reactnativescroll.interop.material3.ui

data class ToolbarActionRecord(
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
