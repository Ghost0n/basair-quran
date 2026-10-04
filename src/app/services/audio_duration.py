"""MP3 duration from the start of the file — no full download.

The recitation bar shows a whole surah's length, which needs every verse's
duration. Reading them from the first few KB of each file (ID3 tag size +
the first MPEG frame header, and a Xing/Info/VBRI header when the file has
one) is enough:

* VBR files carry their frame count in a Xing/Info or VBRI header →
  ``frames × samples_per_frame / sample_rate`` (exact);
* CBR files have none → ``audio bytes × 8 / bitrate`` (exact to the frame).

Pure functions; the fetching lives in recitation_cache_service.
"""

from __future__ import annotations

# Bitrates (kbps) by [version][layer][index]; version 1 = MPEG-1, 2 = MPEG-2/2.5.
_BITRATES = {
    (1, 1): [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    (1, 2): [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    (1, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (2, 1): [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    (2, 2): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    (2, 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
_SAMPLE_RATES = {1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000]}


def id3v2_size(head: bytes) -> int:
    """Bytes taken by a leading ID3v2 tag (0 when there is none)."""
    if len(head) < 10 or head[:3] != b"ID3":
        return 0
    size = (head[6] & 0x7F) << 21 | (head[7] & 0x7F) << 14 | (head[8] & 0x7F) << 7 | (head[9] & 0x7F)
    footer = 10 if head[5] & 0x10 else 0
    return 10 + size + footer


def _frame_header(data: bytes, offset: int) -> dict | None:
    if offset + 4 > len(data) or data[offset] != 0xFF or (data[offset + 1] & 0xE0) != 0xE0:
        return None
    b1, b2, b3 = data[offset + 1], data[offset + 2], data[offset + 3]
    version_bits = (b1 >> 3) & 0x03  # 0: 2.5, 2: 2, 3: 1
    layer_bits = (b1 >> 1) & 0x03  # 1: III, 2: II, 3: I
    if version_bits == 1 or layer_bits == 0:
        return None
    version = {3: 1, 2: 2, 0: 25}[version_bits]
    layer = {3: 1, 2: 2, 1: 3}[layer_bits]
    bitrate_index = b2 >> 4
    rate_index = (b2 >> 2) & 0x03
    if bitrate_index in (0, 15) or rate_index == 3:
        return None
    bitrate = _BITRATES[(1 if version == 1 else 2, layer)][bitrate_index]
    sample_rate = _SAMPLE_RATES[version][rate_index]
    mono = (b3 >> 6) == 3
    if layer == 1:
        samples = 384
    elif layer == 2 or version == 1:
        samples = 1152
    else:
        samples = 576
    return {"version": version, "layer": layer, "bitrate": bitrate, "sample_rate": sample_rate, "mono": mono, "samples": samples}


def find_first_frame(data: bytes, start: int = 0) -> tuple[int, dict] | None:
    """The first valid MPEG audio frame header at or after ``start``."""
    for offset in range(start, max(start, len(data) - 3)):
        header = _frame_header(data, offset)
        if header:
            return offset, header
    return None


def mp3_duration(head: bytes, total_size: int, audio_start: int | None = None) -> float | None:
    """Duration in seconds from the file's first bytes and its total size.

    ``head`` must contain the first MPEG frame (callers re-fetch past a large
    ID3 tag and pass ``audio_start`` as the offset ``head`` begins at, or 0).
    """
    base = 0 if audio_start is None else audio_start
    tag = id3v2_size(head) if base == 0 else 0
    found = find_first_frame(head, tag)
    if not found:
        return None
    offset, header = found
    # Xing / Info (after the side information) or VBRI (32 bytes in).
    if header["version"] == 1:
        side = 17 if header["mono"] else 32
    else:
        side = 9 if header["mono"] else 17
    xing = offset + 4 + side
    if head[xing : xing + 4] in (b"Xing", b"Info") and len(head) >= xing + 12:
        flags = int.from_bytes(head[xing + 4 : xing + 8], "big")
        if flags & 0x1:
            frames = int.from_bytes(head[xing + 8 : xing + 12], "big")
            if frames > 0:
                return frames * header["samples"] / header["sample_rate"]
    vbri = offset + 4 + 32
    if head[vbri : vbri + 4] == b"VBRI" and len(head) >= vbri + 18:
        frames = int.from_bytes(head[vbri + 14 : vbri + 18], "big")
        if frames > 0:
            return frames * header["samples"] / header["sample_rate"]
    audio_bytes = total_size - (base + offset)
    if audio_bytes <= 0 or header["bitrate"] <= 0:
        return None
    return audio_bytes * 8 / (header["bitrate"] * 1000)
