package com.material3scroll.transport

class NestedScrollConservationLedger {
  data class PreFrame(val requestedY: Int, val chromePreY: Int)

  data class Frame(
    val index: Long,
    val requestedY: Int,
    val chromePreY: Int,
    val childConsumedY: Int,
    val chromePostY: Int,
    val remainingY: Int,
    val sumY: Int,
    val balanced: Boolean,
    val brokenFrames: Long,
    val orphanPres: Long,
  )

  data class OrphanPre(
    val index: Long,
    val requestedY: Int,
    val chromePreY: Int,
  )

  data class Snapshot(
    val frames: Long,
    val brokenFrames: Long,
    val orphanPres: Long,
  )

  data class BeginResult(
    val pre: PreFrame,
    val orphanBeforePre: OrphanPre?,
  )

  private var pending: PreFrame? = null
  private var frames = 0L
  private var brokenFrames = 0L
  private var orphanPres = 0L

  val hasPendingPre: Boolean
    get() = pending != null

  fun beginFrame(requestedY: Int, chromePreY: Int): BeginResult {
    val orphan = flushPending()
    val pre = PreFrame(requestedY, chromePreY)
    pending = pre
    return BeginResult(pre, orphan)
  }

  fun completeFrame(childConsumedY: Int, dyUnconsumed: Int, chromePostY: Int): Frame? {
    val pre = pending ?: return null
    pending = null

    frames += 1
    val remainingY = dyUnconsumed - chromePostY
    val sumY = pre.chromePreY + childConsumedY + chromePostY + remainingY
    val balanced = sumY == pre.requestedY
    if (!balanced) brokenFrames += 1

    return Frame(
      frames,
      pre.requestedY,
      pre.chromePreY,
      childConsumedY,
      chromePostY,
      remainingY,
      sumY,
      balanced,
      brokenFrames,
      orphanPres,
    )
  }

  fun flushPending(): OrphanPre? {
    val pre = pending ?: return null
    pending = null
    orphanPres += 1
    return OrphanPre(orphanPres, pre.requestedY, pre.chromePreY)
  }

  fun discardPending() {
    pending = null
  }

  fun snapshot(): Snapshot = Snapshot(frames, brokenFrames, orphanPres)
}
