import handler from './api/generate-prediction';

async function test() {
    try {
        const req = new Request('http://localhost/api/generate-prediction', {
            method: 'POST',
            body: JSON.stringify({ type: 'master', drawName: 'Loto', history: [] }),
            headers: { 'Content-Type': 'application/json' }
        });
        const res = await handler(req);
        console.log(res.status);
        console.log(await res.json());
    } catch (e) {
        console.error(e);
    }
}

test();
