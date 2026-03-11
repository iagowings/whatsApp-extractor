const fs = require('fs');

const rawData = fs.readFileSync('historico_conversas_PARCIAL.json', 'utf-8');
const chats = JSON.parse(rawData);

let interactions = [];

chats.forEach(chat => {
    // Ignora conversas internas ou grupos, foca em clientes
    if (chat.isGroup) return;
    if (chat.chatName.includes('Jessianie') || chat.chatName.includes('Maxxi')) return;

    let currentPatientMsgs = [];

    for (let i = 0; i < chat.messages.length; i++) {
        const msg = chat.messages[i];

        if (msg.sender !== 'Eu') {
            currentPatientMsgs.push(msg.message);
        } else {
            if (currentPatientMsgs.length > 0) {
                // Achou uma resposta do Maxxi (Eu) para mensagens anteriores do paciente
                let j = i;
                let clinicResponses = [];
                while (j < chat.messages.length && chat.messages[j].sender === 'Eu') {
                    clinicResponses.push(chat.messages[j].message);
                    j++;
                }

                interactions.push({
                    patient: currentPatientMsgs.join(' | '),
                    clinic: clinicResponses.join(' | ')
                });

                currentPatientMsgs = [];
                i = j - 1; // Avança o índice
            }
        }
    }
});

// Filtra mensagens muito curtas ou apenas auto-respostas
const filtered = interactions.filter(i => {
    const isAutoReply = i.clinic.includes('nosso atendimento segue disponível *apenas em horário comercial*');
    const isTooShort = i.patient.length < 10;
    return !isAutoReply && !isTooShort;
});

// Remove duplicatas básicas
const uniqueInteractions = [];
const seen = new Set();
for (const item of filtered) {
    if (!seen.has(item.patient)) {
        seen.add(item.patient);
        uniqueInteractions.push(item);
    }
}

fs.writeFileSync('interactions.txt', uniqueInteractions.slice(0, 100).map(i => `PERGUNTA: ${i.patient}\nRESPOSTA: ${i.clinic}\n-----------------------`).join('\n'));
console.log(`Gerado interactions.txt com ${uniqueInteractions.length} extraídas.`);
