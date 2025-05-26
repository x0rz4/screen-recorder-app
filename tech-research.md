# 屏幕录制应用技术调研报告

## 调研背景

根据用户需求，我们需要开发一个具有以下功能的屏幕录制应用：
1. 可自选录屏帧数
2. 可自定义录屏视频保存位置
3. 可选择是否开启系统声音录制
4. 支持设置快捷键结束录屏
5. 录屏时显示悬浮框，展示录制时长和文件大小
6. 录屏结束后对生成的文件进行哈希计算

技术栈要求使用Node.js、Vue 3和Electron。

## 调研结果

### node-screenshots库调研

最初考虑使用node-screenshots库实现屏幕录制功能，但经过调研发现：

- node-screenshots是一个基于XCap的原生Node.js截图库
- 支持Mac、Windows和Linux系统，无需任何依赖
- 目前仅支持截图功能，视频录制功能处于"待实现"状态
- API主要包括Monitor和Window类，用于获取屏幕/窗口信息和截图

由于node-screenshots不支持视频录制，因此不适合作为本项目的核心技术。

### Electron desktopCapturer调研

作为替代方案，我们调研了Electron内置的desktopCapturer API：

- desktopCapturer是Electron的内置模块，用于获取可用于捕获音频和视频的媒体源
- 结合navigator.mediaDevices.getUserMedia和MediaRecorder API可实现完整的屏幕录制功能
- 支持自定义帧率、分辨率等参数
- 支持音频录制和开关控制
- 支持选择保存路径
- 可以通过Electron的globalShortcut模块实现全局快捷键
- 可以通过BrowserWindow创建悬浮窗，显示录制时长和文件大小
- 可以使用Node.js的crypto模块计算文件哈希

### 技术方案确认

基于调研结果，我们决定使用Electron的desktopCapturer结合MediaRecorder API作为屏幕录制的核心技术方案：

1. 使用desktopCapturer.getSources获取可用的屏幕和窗口
2. 使用navigator.mediaDevices.getUserMedia获取媒体流
3. 使用MediaRecorder API录制视频，支持自定义帧率
4. 使用Electron的dialog模块选择保存路径
5. 使用Electron的globalShortcut模块实现全局快捷键
6. 使用BrowserWindow创建悬浮窗，显示录制信息
7. 使用Node.js的crypto模块计算文件哈希

这一方案完全满足用户的所有功能需求，并且与Vue 3和Electron技术栈完美兼容。

## 下一步计划

1. 更新项目架构设计，整合desktopCapturer方案
2. 实现自定义录屏参数功能（帧率、保存路径、音频开关）
3. 实现快捷键结束录屏功能
4. 开发悬浮窗显示录制时长和文件大小
5. 实现录屏文件哈希计算功能
6. 进行功能验证和用户测试
