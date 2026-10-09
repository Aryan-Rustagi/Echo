const express = require('express');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
    }
    
    console.log(`Received audio file: ${req.file.originalname} (${req.file.size} bytes)`);

    // A webm/ogg file with just a header is around ~1KB. If it's less than 4KB, it's virtually empty/silent.
    if (req.file.size < 4000) {
        console.log("Audio file too small (likely empty). Skipping Whisper to avoid hallucinations.");
        return res.json({ transcript: "" });
    }
    
    try {
        // Convert the multer memory buffer into a Blob for FormData
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        
        formData.append('file', blob, req.file.originalname);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');
        
        // Whisper prompt helps guide the model to not hallucinate on background noise
        formData.append('prompt', 'Transcribe the following exactly. Do not output "Thank you." for silence.');

        const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: formData
        });

        if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            console.error("Groq API Error:", errorText);
            return res.status(groqResponse.status).json({ error: "Transcription failed at Groq API" });
        }

        const data = await groqResponse.json();
        console.log("Raw Transcription result:", data.text);

        // Filter out common Whisper silence hallucinations
        let text = data.text.trim();
        const hallucinations = ["Thank you.", "Thank you", "Thank you for watching.", "Thanks for watching.", "Thank you for watching!", "Thanks.", "Thank you!"];
        if (hallucinations.includes(text)) {
            text = "";
            console.log("Filtered out Whisper hallucination.");
        }
        
        // Return exactly what the frontend stt.ts expects
        res.json({ transcript: text });
        
    } catch (err) {
        console.error("Transcription Server Error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
