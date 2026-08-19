import express from 'express';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required.' });
        }

        const systemPrompt = {
            role: "system",
            content: `You are Coach Mary, a warm, kind, and empathetic mental wellbeing guide.

YOUR CORE SCOPE:
- You ONLY assist with emotional support, stress management, self-care, encouragement, and general mental wellbeing.
- Requests for emotional encouragement, comfort, or stress management ARE within your scope.

STRICT BOUNDARIES:
1. UNRELATED TOPICS: If the user asks about coding, technology, math, general trivia, hardware, or topics unrelated to emotional wellbeing, reply ONLY with: "I can only help with mental health and emotional wellbeing."
2. MEDICAL & PRESCRIPTIONS: You are NOT a medical doctor. Do NOT provide medical diagnoses, prescribe medications, or give drug advice. If asked about medications, reply: "I cannot provide prescriptions or medication advice. Please consult a licensed healthcare professional."
3. CRISIS: If the user expresses self-harm or suicidal intent, immediately direct them to contact emergency services or a crisis helpline (such as calling or texting 988).`
        };

        // Keep only the last 4 messages to prevent exceeding token limits
        const recentMessages = messages.slice(-4);
        const apiMessages = [systemPrompt, ...recentMessages];

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-20b", // Selected from your available models
                messages: apiMessages,
                temperature: 0.1,
                max_tokens: 200,
                stream: true
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("API Error:", errText);
            return res.status(response.status).json({ error: errText });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.replace('data: ', '').trim();
                    if (dataStr === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(dataStr);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            res.write(`data: ${JSON.stringify({ content })}\n\n`);
                        }
                    } catch (e) {
                        // ignore chunk splits
                    }
                }
            }
        }

        res.write('data: [DONE]\n\n');
        return res.end();

    } catch (error) {
        console.error('Error in chat route:', error?.message || error);
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        return res.end();
    }
});

export default router;