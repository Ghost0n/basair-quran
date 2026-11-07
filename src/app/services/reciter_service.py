"""Reciter catalogue.

A small, static reference list of reciters. Per-ayah audio is served from
everyayah.com — the de-facto public ayah-audio source with stable,
predictable MP3 URLs (``{audio_base}/{SSS}{AAA}.mp3`` where SSS/AAA are
the zero-padded surah and ayah numbers).

Swapping to a self-hosted mirror later only means changing ``audio_base``.
"""

from __future__ import annotations

_EVERYAYAH = "https://everyayah.com/data"

RECITERS: list[dict] = [
    {
        "id": "alafasy",
        "name": "مشاري راشد العفاسي",
        "name_english": "Mishary Rashid Alafasy",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Alafasy_128kbps",
    },
    {
        "id": "husary",
        "name": "محمود خليل الحُصري",
        "name_english": "Mahmoud Khalil Al-Husary",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Husary_128kbps",
    },
    {
        "id": "abdulbasit",
        "name": "عبد الباسط عبد الصمد",
        "name_english": "Abdul Basit Abdul Samad",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Abdul_Basit_Murattal_192kbps",
    },
    {
        "id": "minshawi",
        "name": "محمد صديق المنشاوي",
        "name_english": "Mohamed Siddiq El-Minshawi",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Minshawy_Murattal_128kbps",
    },
    {
        "id": "sudais",
        "name": "عبد الرحمن السديس",
        "name_english": "Abdurrahman As-Sudais",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Abdurrahmaan_As-Sudais_192kbps",
    },
    {
        "id": "shuraim",
        "name": "سعود الشُّريم",
        "name_english": "Saud Al-Shuraim",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Saood_ash-Shuraym_128kbps",
    },
    {
        "id": "ghamdi",
        "name": "سعد الغامدي",
        "name_english": "Saad Al-Ghamdi",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Ghamadi_40kbps",
    },
    {
        "id": "ajmy",
        "name": "أحمد بن علي العجمي",
        "name_english": "Ahmed Al-Ajmy",
        "riwayah": "hafs",
        "style": "murattal",
        "audio_base": f"{_EVERYAYAH}/Ahmed_ibn_Ali_al_Ajamy_128kbps",
    },
]


def list_reciters() -> list[dict]:
    return [dict(reciter) for reciter in RECITERS]
