#pragma once
#include <stdint.h>

// IMA ADPCM, low nibble first; each recording starts at predictor/index zero.
struct ImaEncoder {
    int predictor = 0;
    int index = 0;
    uint8_t encode(int sample) {
        static const int steps[] = {7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767};
        static const int indices[] = {-1,-1,-1,-1,2,4,6,8};
        int step = steps[index], delta = sample - predictor;
        uint8_t nibble = delta < 0 ? 8 : 0;
        if (delta < 0) delta = -delta;
        int change = step >> 3;
        if (delta >= step) { nibble |= 4; delta -= step; change += step; }
        if (delta >= (step >> 1)) { nibble |= 2; delta -= step >> 1; change += step >> 1; }
        if (delta >= (step >> 2)) { nibble |= 1; change += step >> 2; }
        predictor += (nibble & 8) ? -change : change;
        if (predictor > 32767) predictor = 32767;
        if (predictor < -32768) predictor = -32768;
        index += indices[nibble & 7];
        if (index < 0) index = 0;
        if (index > 88) index = 88;
        return nibble;
    }
};
