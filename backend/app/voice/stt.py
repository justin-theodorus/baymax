"""
STT via Deepgram Nova-2.
Raw audio is NEVER stored — only the returned transcript is used.
"""
from deepgram import DeepgramClient, PrerecordedOptions

from app.config import settings

# Map Deepgram language codes to app language codes
_LANG_MAP = {
    "en": "en",
    "en-US": "en",
    "en-SG": "en",
    "zh": "zh",
    "zh-CN": "zh",
    "zh-TW": "zh",
    "ms": "ms",
    "ta": "ta",
}


def transcribe_audio(audio_bytes: bytes) -> dict:
    """
    Transcribe audio bytes using Deepgram Nova-2.

    Returns:
        {"transcript": str, "language": str, "confidence": float}
    """
    client = DeepgramClient(settings.deepgram_api_key)

    options = PrerecordedOptions(
        model="nova-2",
        detect_language=True,
        smart_format=True,
    )

    # mimetype must be specified so Deepgram knows how to decode webm/opus from the browser
    payload = {"buffer": audio_bytes, "mimetype": "audio/webm;codecs=opus"}
    response = client.listen.prerecorded.v("1").transcribe_file(payload, options)

    channels = response["results"]["channels"]
    alt = channels[0]["alternatives"][0]
    transcript = alt.get("transcript", "")
    confidence = alt.get("confidence", 0.0)

    detected_raw = channels[0].get("detected_language", "en")
    app_lang = _LANG_MAP.get(detected_raw, "en")

    return {
        "transcript": transcript,
        "language": app_lang,
        "confidence": confidence,
    }
