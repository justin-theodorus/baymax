"""
TTS via Azure Neural Speech.
Returns WAV audio bytes for streaming to client.
"""
import azure.cognitiveservices.speech as speechsdk

from app.config import settings

_VOICE_MAP = {
    "en": "en-SG-LunaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ms": "ms-MY-YasminNeural",
    "ta": "ta-SG-VenbaNeural",
}

_RATE_MAP = {
    "normal": "-10%",
    "slow": "-25%",
}


def synthesize_speech(text: str, language: str = "en", speed: str = "normal") -> bytes:
    """
    Synthesize text to WAV audio bytes using Azure Neural TTS.
    Speed 'slow' is recommended for elderly users.
    """
    voice = _VOICE_MAP.get(language, _VOICE_MAP["en"])
    rate = _RATE_MAP.get(speed, _RATE_MAP["normal"])

    # Escape XML special chars in text
    safe_text = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
        # Remove markdown bold markers
        .replace("**", "")
        .replace("*", "")
    )

    ssml = (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language}">'
        f'<voice name="{voice}">'
        f'<prosody rate="{rate}">{safe_text}</prosody>'
        f"</voice>"
        f"</speak>"
    )

    speech_config = speechsdk.SpeechConfig(
        subscription=settings.azure_speech_key,
        region=settings.azure_speech_region,
    )
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm
    )

    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=None,  # no output device — get bytes directly
    )

    result = synthesizer.speak_ssml_async(ssml).get()

    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        return result.audio_data

    cancellation = result.cancellation_details
    raise RuntimeError(
        f"TTS synthesis failed: {result.reason}. "
        f"Details: {cancellation.reason if cancellation else 'unknown'}"
    )
