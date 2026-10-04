// Host-side codec check: c++ -std=c++11 ima-encode.cpp -o /tmp/ima-encode
// Input is signed 16-bit little-endian mono PCM; output is low-nibble-first IMA.
#include "../../firmware/src/ima_adpcm.h"
#include <fstream>
int main(int argc, char** argv) {
    if (argc != 3) return 1;
    std::ifstream input(argv[1], std::ios::binary);
    std::ofstream output(argv[2], std::ios::binary);
    if (!input || !output) return 2;
    ImaEncoder encoder;
    char bytes[4];
    while (input.read(bytes, 4)) {
        const int16_t a = (uint8_t)bytes[0] | ((uint8_t)bytes[1] << 8);
        const int16_t b = (uint8_t)bytes[2] | ((uint8_t)bytes[3] << 8);
        const uint8_t lo = encoder.encode(a), hi = encoder.encode(b);
        output.put(lo | (hi << 4));
    }
    return output ? 0 : 3;
}
