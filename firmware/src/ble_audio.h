#pragma once
#include <stddef.h>
#include <stdint.h>
bool bleAudioBegin(bool steer, bool test = false);
bool bleAudioAppend(const int16_t* samples, size_t count);
void bleAudioFinish();
void bleAudioPump();
bool bleAudioBusy();
void bleAudioAck(uint32_t id, int seq);
void bleAudioCancel();
