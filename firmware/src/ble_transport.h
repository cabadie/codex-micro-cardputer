#pragma once

#include <stddef.h>
#include <stdint.h>

bool bleTransportBegin();
uint8_t bleTransportRecoveredStage();
void bleTransportLoop();
bool bleTransportConnected();
bool bleTransportSendLine(const char* line);
void bleTransportSetBattery(uint8_t level);

bool bleHidConnected();
void bleHidPress(uint8_t key);
void bleHidReleaseAll();
void bleHidWrite(uint8_t value);
