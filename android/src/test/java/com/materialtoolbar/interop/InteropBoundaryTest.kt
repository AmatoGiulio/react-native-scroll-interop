package com.materialtoolbar.interop

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The consumer boundary is the whole architectural claim of this library, so it is asserted
 * mechanically rather than described in a document.
 *
 * Two rules:
 *  1. The transport-neutral contract must not know that React Native exists.
 *  2. Material consumers must not know either — they may only talk to the interop package.
 *
 * `ReactScrollViewTransport.kt` is the single, deliberate exception: it *is* the React Native
 * adapter. When an upstream transport replaces it, this test is what proves the consumers did not
 * quietly grow a dependency on the old one in the meantime.
 */
class InteropBoundaryTest {

  private val sourceRoot = File("src/main/java/com/materialtoolbar")

  private val forbiddenImports = listOf(
    "com.facebook.react",
    "expo.modules",
  )

  @Test
  fun `interop contract has no transport imports`() {
    val allowed = setOf("ReactScrollViewTransport.kt")
    val files = File(sourceRoot, "interop").kotlinFiles().filterNot { it.name in allowed }
    val offenders = files.flatMap { file -> file.offendingImports() }

    assertTrue(
      "Transport-neutral interop files must not import a transport:\n" +
        offenders.joinToString("\n"),
      offenders.isEmpty(),
    )
  }

  @Test
  fun `material consumers have no transport imports`() {
    val offenders = File(sourceRoot, "consumers").kotlinFiles().flatMap { it.offendingImports() }

    assertTrue(
      "Material consumers must depend only on com.materialtoolbar.interop:\n" +
        offenders.joinToString("\n"),
      offenders.isEmpty(),
    )
  }

  /**
   * Resolving to nothing would make both assertions pass without inspecting anything, so an empty
   * directory is treated as a failure rather than as a clean result.
   */
  private fun File.kotlinFiles(): List<File> {
    val files = listFiles { file: File -> file.extension == "kt" }.orEmpty().toList()
    assertTrue(
      "Expected Kotlin sources under $absolutePath. The boundary test is not looking at the " +
        "real source tree, so it would pass vacuously.",
      files.isNotEmpty(),
    )
    return files
  }

  private fun File.offendingImports(): List<String> =
    readLines()
      .filter { it.trimStart().startsWith("import ") }
      .filter { line -> forbiddenImports.any { line.contains(it) } }
      .map { "$name: ${it.trim()}" }
}
