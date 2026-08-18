# Shared Android transport sources

This source set contains Android/RN nested-scroll primitives that must compile in both the Expo module and the bare React Native certification host.

The neutral core package is `com.reactnativescroll.interop.core`.

It must remain independent of Expo APIs, Compose Material components, React Native concrete scroll-view types, and app-specific probe code.

The physical source directory remains historical in this step; moving files is a separate mechanical refactor.
