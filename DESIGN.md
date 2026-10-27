# Echo Design Direction

Echo is designed as a precision audio instrument: a calm, monochrome studio surface anchored by a live real-time signal line that responds to acoustic amplitude. A single amber live indicator activates exclusively during active speech capture and synthesis, eliminating AI fluff in favor of high-craft signal path clarity.

## Core Design Principles
1. **Precision Instrument Aesthetic**: Inspired by studio audio hardware and mastering monitors. Clean lines, strict alignment, purposeful tactile feedback.
2. **Honest Feedback**: Real measured latency from `performance.now()` (STT → First Token → First Audio). No simulated numbers, fake interview metrics, or decorative badges.
3. **Responsive Waveform**: Directly driven by the Web Audio `AnalyserNode` frequency/time-domain data for microphone input and speech synthesis output. Zero random oscillations.
4. **Accessible Everywhere**: Full WCAG AA contrast across both Light and Dark themes. Respects `prefers-reduced-motion` and supports push-to-talk with Spacebar. Mobile-first down to 360px width.
