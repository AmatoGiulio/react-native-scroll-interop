# Shared Android transport sources

This source set contains Android/RN nested-scroll primitives that must compile in both the Expo module and the bare React Native certification host.

The neutral core package is `com.reactnativescroll.interop.core`.

The React Native compatibility adapter package is `com.reactnativescroll.interop.reactnative`; its source now lives in this shared source set so the Expo module and bare RN certification host compile the same adapter implementation.

The core package must remain independent of Expo APIs, Compose Material components, React Native concrete scroll-view types, and app-specific probe code. The React Native adapter may recognize supported RN source implementations only behind its compatibility boundary and must remain free of Expo and Material3 APIs.

The physical core source directory remains historical in this step; moving those files is a separate mechanical refactor.
