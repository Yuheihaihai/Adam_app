async function init() {
    try {
        const tokenResponse = await fetch("/session");
        const data = await tokenResponse.json();
        const EPHEMERAL_KEY = data.client_secret.value;

        const pc = new RTCPeerConnection();

        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        pc.ontrack = e => audioEl.srcObject = e.streams[0];

        const ms = await navigator.mediaDevices.getUserMedia({
            audio: true
        });
        pc.addTrack(ms.getTracks()[0]);

        const dc = pc.createDataChannel("oai-events");
        dc.addEventListener("message", (e) => {
            const event = JSON.parse(e.data);
            console.log('Server event:', event);

            if (event.type === 'text.generation') {
                document.getElementById('transcript').textContent += 
                    `\nAI: ${event.text}`;
            }
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const baseUrl = "https://api.openai.com/v1/realtime";
        const model = "gpt-4o-realtime-preview-2024-12-17";
        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                "Content-Type": "application/sdp"
            },
        });

        const answer = {
            type: "answer",
            sdp: await sdpResponse.text(),
        };
        await pc.setRemoteDescription(answer);

        dc.addEventListener("open", () => {
            const responseCreate = {
                type: "response.create",
                response: {
                    modalities: ["text", "audio"],
                    instructions: "Hello, I'm ready to chat!"
                },
            };
            dc.send(JSON.stringify(responseCreate));
        });

        document.getElementById('startChat').disabled = true;
        document.getElementById('stopChat').disabled = false;
        document.getElementById('status').textContent = 'Connected';

        window.pc = pc;
        window.dc = dc;
        window.ms = ms;

    } catch (error) {
        console.error('Connection error:', error);
        document.getElementById('status').textContent = 'Connection failed';
    }
}

document.getElementById('startChat').onclick = init;
document.getElementById('stopChat').onclick = () => {
    window.ms?.getTracks().forEach(track => track.stop());
    window.dc?.close();
    window.pc?.close();

    document.getElementById('startChat').disabled = false;
    document.getElementById('stopChat').disabled = true;
    document.getElementById('status').textContent = 'Disconnected';
}; 