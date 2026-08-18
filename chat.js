import express from 'express';

const router = express.Router();

// Simple keyword-based checks
// function containsKeyword(text, keywords) {
//     if (!text) return false;
//     const lower = text.toLowerCase();
//     return keywords.some(k => lower.includes(k));
// }

// function isMentalHealthRelated(text) {
//     const mhKeywords = [
//         'anxiety', 'depress', 'panic', 'suicid', 'therapy', 'therapist', 'mental', 'stress', 'mood', 'panic attack', 'self-harm', 'bipolar', 'adhd', 'trauma', 'ptsd', 'wellbeing', 'well-being', 'emotional'
//     ];
//     return containsKeyword(text, mhKeywords);
// }

// function anyUserMessagesAreMH(messages) {
//     if (!Array.isArray(messages)) return false;
//     const combined = messages.filter(m => (m.role === 'user' || m.role === 'user') && (m.content || m.message)).map(m => (m.content || m.message)).join(' ');
//     return isMentalHealthRelated(combined);
// }

// function isOutOfScope(text) {
//     if (!text) return false;
//     const outKeywords = ['computer', 'program', 'programming', 'install', 'setup', 'bug', 'error', 'fix', 'repair', 'troubleshoot', 'compile', 'code', 'javascript', 'python', 'sql', 'network', 'router', 'printer', 'laptop', 'how to', 'how do i', 'how to fix', 'fix my'];
//     return containsKeyword(text, outKeywords);
// }

// function isPrescriptionRequest(text) {
//     const prescKeywords = [
//         'prescrib', 'prescription', 'medication', 'medications', 'dose', 'dosage', 'mg', 'tablet', 'pill', 'antidepressant', 'ssri', 'benzodiazepine', 'prozac', 'zoloft', 'sertraline', 'fluoxetine', 'paroxetine', 'citalopram', 'bupropion', 'venlafaxine'
//     ];
//     return containsKeyword(text, prescKeywords);
// }

// function isCrisis(text) {
//     const crisisKeywords = ['suicide', 'kill myself', 'want to die', 'end my life', 'hurting myself', 'self harm'];
//     return containsKeyword(text, crisisKeywords);
// }

router.post('/', async (req, res) => {
    console.log("start");
    
    try {
        const HF_TOKEN = process.env.HF_TOKEN;
        console.log(HF_TOKEN);
        
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required.' });
        }

        // enforce strict system prompt limiting the assistant to mental wellbeing support
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

        // require the most recent user message to be mental-health related
        // const lastUserMsgObj = [...messages].reverse().find(m => m.role === 'user');
        // const lastUserText = lastUserMsgObj && (lastUserMsgObj.content || lastUserMsgObj.message || '');

        // if (!isMentalHealthRelated(lastUserText)) {
        //     return res.status(400).json({ error: 'Out of scope. I can only help with mental health and emotional wellbeing.' });
        // }

        // if (isCrisis(lastUserText)) {
        //     return res.status(400).json({ error: 'Crisis detected. Please contact local emergency services or a crisis hotline immediately.' });
        // }

        // if (isPrescriptionRequest(lastUserText)) {
        //     return res.status(400).json({ error: 'Cannot provide prescriptions. Please consult a licensed healthcare professional.' });
        // }

        // if (isOutOfScope(lastUserText)) {
        //     return res.status(400).json({ error: 'Out of scope. I can only help with mental health and emotional wellbeing.' });
        // }

        const apiMessages = [systemPrompt, ...messages];

        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "Qwen/Qwen2.5-7B-Instruct",
                messages: apiMessages,
                max_tokens: 500,
                temperature: 0.2,
                stream: true
            }),
        });
        console.log();
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log({"erre":errorData});
            
            throw new Error(errorData || `HTTP ${response.status}`);
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const decoder = new TextDecoder('utf-8');

        // Buffer the full assistant response from the model, then validate it before sending to client
        let aggregated = '';

        for await (const chunk of response.body) {
            console.log(response.body);
            
            const text = decoder.decode(chunk, { stream: true });
            const lines = text.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.replace('data: ', '').trim();
                    if (dataStr === '[DONE]') {
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.choices && parsed.choices.length > 0) {
                            const delta = parsed.choices[0].delta;
                            if (delta && typeof delta.content === 'string') {
                                aggregated += delta.content;
                                // quick abort if prescription keywords appear in stream
                                if (isPrescriptionRequest(delta.content)) {
                                    aggregated = '';
                                    aggregated = 'I cannot provide prescriptions or medication advice. Please consult a licensed healthcare professional.';
                                    // stop reading further
                                    // drain remaining body
                                    if (response.body && typeof response.body.cancel === 'function') response.body.cancel();
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        // ignore parse errors for partial chunks
                    }
                }
            }
        }

        // final validation: if the assistant reply does not contain any mental-health keywords, refuse
        // if (!isMentalHealthRelated(aggregated)) {
        //     const safeMsg = 'I can only help with mental health and emotional wellbeing.';
        //     res.write(`data: ${JSON.stringify({ content: safeMsg })}\n\n`);
        //     res.write('data: [DONE]\n\n');
        //     res.end();
        //     return;
        // }

        // send aggregated response to client as a single streamed chunk
        if (aggregated) {
            console.log(aggregated);
            
            // split into reasonable chunks to mimic streaming
            const chunkSize = 800;
            for (let i = 0; i < aggregated.length; i += chunkSize) {
                const part = aggregated.slice(i, i + chunkSize);
                res.write(`data: ${JSON.stringify({ content: part })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('Error in chat route:', error);
        res.status(500).json({ error: `Medical AI Call Failed: ${error.message}` });
    }
});

export default router;
