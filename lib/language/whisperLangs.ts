/**
 * Which of the site's languages Whisper can listen to, and the code it wants for them.
 * Used by the "spoken language" choice in the subtitles panel. Languages Whisper does
 * not know (Zulu, Odia, …) are not offered there: pinning one would only make the
 * request fail. Automatic detection still works for everything it recognises.
 */

/** Our code → Whisper's code (only where they differ). */
const RENAMED: Record<string, string> = { "zh-TW": "zh", jv: "jw" };

/** Site codes Whisper accepts, by the code Whisper uses for them. */
const WHISPER = new Set(
  (
    "en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt ml cy sk te fa lv bn sr az sl kn et mk eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af ka be tg sd gu am lo uz ps tk mt my tl mg as tt ln ha ba su jw"
  ).split(" ")
);

/** The code to send Whisper for one of our language codes, or null when it cannot be pinned. */
export function toWhisperCode(code: string): string | null {
  const wanted = RENAMED[code] ?? code.split("-")[0].toLowerCase();
  return WHISPER.has(wanted) ? wanted : null;
}

export function canPinLanguage(code: string): boolean {
  return toWhisperCode(code) !== null;
}
