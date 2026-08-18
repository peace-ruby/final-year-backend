const fetch = global.fetch;

(async () => {
    try {
        const res = await fetch('https://final-year-backend-b1fp.onrender.com/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'Password123!' }),
        });

        console.log('status', res.status);
        console.log('headers', Object.fromEntries(res.headers.entries()));
        const text = await res.text();
        console.log('body', text);
    } catch (error) {
        console.error(error);
    }
})();