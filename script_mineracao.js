const fs = require('fs');

const rawData = fs.readFileSync('historico_conversas_PARCIAL.json', 'utf-8');
const chats = JSON.parse(rawData);

let interactions = [];

// Lista de mensagens automáticas para ignorar
const autoReplies = [
    "nosso atendimento segue disponível *apenas em horário comercial*",
    "Maxxi Saúde agradece seu contato. Um instante",
    "Maxxi Saude: Ola, segue link com o resultado do exame",
    "Olá boa tarde, bem vindo ao canal de atendimento da Clínica MaxxiSaúde!",
    "Olá boa tarde bem vindo ao canal de atendimento da MaxxiSaúde",
    "Olá bom dia bem vindo ao canal de atendimento da MaxxiSaúde",
    "Ficamos felizes em poder ajudar! Caso precise de algo mais,estamos à disposição",
    "Por nada! A MaxxiSaúde agradece seu contato e preferência",
    "A maxxisaude agradece sua confirmação",
    "Você está no canal de atendimento da Maxxi Saúde"
];

function isClean(text) {
    if (text.length < 5) return false;
    for (let reply of autoReplies) {
        if (text.includes(reply)) return false;
    }
    return true;
}

chats.forEach(chat => {
    if (chat.isGroup || chat.chatName.toLowerCase().includes('jessianie') || chat.chatName.toLowerCase().includes('maxxi')) return;

    let currentPatientMsgs = [];

    for (let i = 0; i < chat.messages.length; i++) {
        const msg = chat.messages[i];

        if (msg.sender !== 'Eu') {
            currentPatientMsgs.push(msg.message.trim());
        } else {
            if (currentPatientMsgs.length > 0) {
                let j = i;
                let clinicResponses = [];
                while (j < chat.messages.length && chat.messages[j].sender === 'Eu') {
                    clinicResponses.push(chat.messages[j].message.trim());
                    j++;
                }

                const patientText = currentPatientMsgs.join(' ');
                const clinicText = clinicResponses.join(' ');

                const pTextLower = patientText.toLowerCase().trim();

                if (isClean(clinicText) && isClean(patientText) && clinicText.length > 5 && !clinicText.includes('BEGIN:VCARD') && !patientText.includes('http') && !clinicText.includes('.pdf') && !patientText.includes('.pdf')) {
                    interactions.push({
                        q: patientText,
                        a: clinicText
                    });
                }

                currentPatientMsgs = [];
                i = j - 1;
            }
        }
    }
});

const uniqueInteractions = [];
const seenQ = new Set();
const seenA = new Set();

for (const item of interactions) {
    if (!seenQ.has(item.q) && !seenA.has(item.a)) {
        seenQ.add(item.q);
        seenA.add(item.a);
        uniqueInteractions.push(item);
    }
}

let mdContent = `# Lista Frequente de Q&A Diretas (Maxxi Saúde)

Abaixo estão listadas **todas** as perguntas e respostas isoladas e diretas que foram encontradas neste primeiro lote de extração de mensagens (livres de mensagens automáticas de saudação). 

Ele te mostra como o cliente de fato pergunta e como as recepcionistas responderam.\n\n`;

uniqueInteractions.forEach((item, index) => {
    mdContent += `**Pergunta do Paciente:**\n* "${item.q.replace(/\n/g, ' ')}"\n\n**Resposta da Clínica:**\n* "${item.a.replace(/\n/g, ' ')}"\n\n---\n\n`;
});

fs.writeFileSync('C:\\Users\\Iago\\.gemini\\antigravity\\brain\\1bbcf036-6539-4f3f-9616-346d664fcd7b\\lista_completa_qea.md', mdContent);
console.log(`Lista completa salva com ${uniqueInteractions.length} pares Q&A.`);
