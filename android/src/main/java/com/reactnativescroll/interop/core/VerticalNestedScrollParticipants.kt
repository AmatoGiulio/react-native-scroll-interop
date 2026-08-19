package com.reactnativescroll.interop.core

/**
 * Consuming participant for the PRE phase of a real vertical Android nested-scroll transaction.
 *
 * [availableY] uses Android's signed vertical-scroll convention. Return only the amount consumed
 * from that available distance; the dispatcher clamps the result to the currently available range.
 * [inputType] is the Android nested-scroll input type supplied by the source transaction.
 */
fun interface VerticalNestedPreScrollConsumer {
  fun consumePreScroll(availableY: Int, inputType: Int): Int
}

/**
 * Consuming participant for the POST phase of a real vertical Android nested-scroll transaction.
 *
 * [childConsumedY] is the distance already consumed by the scrolling child. [availableY] is the
 * still-unconsumed POST distance. Return only consumption from [availableY]; the dispatcher clamps
 * the result before exposing it to the parent consumed array.
 */
fun interface VerticalNestedPostScrollConsumer {
  fun consumePostScroll(childConsumedY: Int, availableY: Int, inputType: Int): Int
}

/**
 * Observation-only participant that runs after every consuming POST participant.
 *
 * Observers receive the child's real consumed distance but have no return value and therefore cannot
 * mutate nested-scroll consumption accounting.
 */
fun interface VerticalNestedPostScrollObserver {
  fun observePostScroll(childConsumedY: Int, inputType: Int)
}
