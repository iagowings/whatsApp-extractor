const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const readline = require('readline/promises');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const AUTH_FOLDER = path.join(__dirname, '.wwebjs_auth');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function menuInicial() {
    console.clear();
    console.log('==================================================');
    console.log('   🤖 EXTRATOR DE CONVERSAS WA - MAXXI SAÚDE 🤖   ');
    console.log('==================================================\n');
    console.log('Escolha uma opção:');
    console.log('1) 🟢 Iniciar Extração (Continuar com sessão já salva)');
    console.log('2) 🔄 Gerar Novo QR Code (Limpar sessão atual e trocar de número)');
    console.log('3) ❌ Sair\n');

    const resposta = await rl.question('Digite o número da opção (1, 2 ou 3) e aperte Enter: ');

    if (resposta === '2') {
        if (fs.existsSync(AUTH_FOLDER)) {
            console.log('\n[!] Apagando sessão anterior do computador...');
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            console.log('✅ Sessão apagada com sucesso! Preparando para gerar o QR Code zerado...\n');
        } else {
            console.log('\n[!] Nenhuma sessão anterior encontrada. Prosseguindo limpo...\n');
        }
        rl.close();
        iniciarCliente();
    } else if (resposta === '1') {
        console.log('\n[!] Iniciando com a sessão existente...');
        rl.close();
        iniciarCliente();
    } else if (resposta === '3') {
        console.log('\nFinalizando...');
        process.exit(0);
    } else {
        console.log('\n⚠️ Opção inválida. Tente novamente.');
        await wait(2000);
        menuInicial();
    }
}

function iniciarCliente() {
    console.log('[🔄] ESTÁGIO 0: Configurando o navegador invisível...');

    // As Flags do Puppeteer aqui resolvem o problema de "Execution Context was Destroyed" porque impedem
    // que ele feche por falta de memória RAM ou cause o reload (navigation) imprevisto do Web worker do WhatsApp.
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true, // Roda sem abrir janela visível
            protocolTimeout: 2147483647, // Previne o erro "Runtime.callFunctionOn timed out" em WhatsApp com muitas conversas
            timeout: 0,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        },
        // Evita que o cache "quebrado" do Whatsapp cause um F5 na página de fundo, gerando o erro que você teve
        webVersionCache: {
            type: 'none'
        }
    });

    client.on('qr', (qr) => {
        console.log('\n[!] SESSÃO NÃO INICIADA! Por favor, escaneie o QR Code abaixo com o seu celular:');
        qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
        console.log('[🔐] ESTÁGIO 1: Autenticado com sucesso no servidor do WhatsApp!');
    });

    client.on('auth_failure', msg => {
        console.error('[❌] ESTÁGIO 1 (ERRO): Falha na autenticação. Talvez o celular esteja desconectado.', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('\n[❌] Desconectado! Motivo:', reason);
        console.log('Se você fechou a sessão pelo celular ou a internet caiu, execute o robô novamente. O processo parou.');
        process.exit(1);
    });

    client.on('ready', async () => {
        console.log('[✅] ESTÁGIO 2: Sistema carregado na memória e lendo DOM. Pronto para iniciar extração!');

        try {
            console.log('     > Obtendo lista completa de conversas... (Aguarde alguns segundos)');
            const chats = await client.getChats();
            console.log(`\n[📊] ESTÁGIO 3: O sistema identificou ${chats.length} conversas no seu celular.\n`);

            const historico_completo = [];

            // O Prompt do Windows intercepta o Ctrl+C no arquivo .bat, então criamos um comando mais seguro: Tecla 'Q'
            console.log('\n======================================================');
            console.log('💡 DICA: Você não precisa esperar acabar tudo.');
            console.log('Aperte a tecla "Q" seguido de Enter a qualquer momento');
            console.log('para PARAR o bot e SALVAR o que já foi lido!');
            console.log('======================================================\n');

            const rlStop = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rlStop.on('line', (input) => {
                if (input.trim().toLowerCase() === 'q') {
                    console.log('\n\n[⚠️] PROGRAMA CANCELADO PELO USUÁRIO (Comando Q detectado)!');
                    if (historico_completo.length > 0) {
                        console.log(`[💾] Salvando os dados lidos até o momento...`);
                        const arquivo = 'historico_conversas_PARCIAL.json';
                        fs.writeFileSync(arquivo, JSON.stringify(historico_completo, null, 2), 'utf8');
                        console.log(`🎉 Arquivo de emergência "${arquivo}" gerado com ${historico_completo.length} conversas!`);
                    } else {
                        console.log('Nenhuma conversa havia sido extraída ainda.');
                    }
                    process.exit(0);
                }
            });

            for (let i = 0; i < chats.length; i++) {
                const chat = chats[i];
                const porcentagem = (((i + 1) / chats.length) * 100).toFixed(1);

                console.log(`[▶️ Progresso: ${porcentagem}%] Analisando Chat [${i + 1}/${chats.length}]: ${chat.name || chat.id.user}`);

                let messages;
                try {
                    // Tenta puxar até 500 mensagens do histórico que estão visíveis
                    messages = await chat.fetchMessages({ limit: 500 });
                } catch (err) {
                    console.error(`     [⚠️] Erro de rede ao tentar ler mensagens de ${chat.name || chat.id.user}, pulando para o próximo.`);
                    continue;
                }

                const chatLog = {
                    chatName: chat.name || chat.id.user,
                    isGroup: chat.isGroup,
                    messages: []
                };

                for (const msg of messages) {
                    // Filtra para garantir que só pegamos texto, não figurinhas ou mídias vazias
                    if (msg.body && typeof msg.body === 'string' && msg.body.trim().length > 0) {
                        chatLog.messages.push({
                            sender: msg.fromMe ? 'Eu' : (msg.author || msg.from),
                            timestamp: msg.timestamp,
                            date: new Date(msg.timestamp * 1000).toLocaleString('pt-BR'),
                            message: msg.body.trim()
                        });
                    }
                }

                if (chatLog.messages.length > 0) {
                    historico_completo.push(chatLog);
                    console.log(`     > Sucesso: ${chatLog.messages.length} mensagens de texto válidas coletadas nesta conversa.`);
                } else {
                    console.log(`     > Nenhuma mensagem de texto válida encontrada (apenas mídias/áudios).`);
                }

                // Driblando o anti-spam no espaço de tempo entre um chat e outro
                // Só gera o delay se NÃO for o último chat
                if (i < chats.length - 1) {
                    const delay = Math.floor(Math.random() * (40000 - 15000 + 1)) + 15000;
                    console.log(`⏳ [SISTEMA] Aguardando ${(delay / 1000).toFixed(1)} segundos para imitar um humano lendo e evitar bloqueios pelo Meta...`);
                    await wait(delay);
                }
            }

            console.log(`\n[💾] ESTÁGIO 4: Finalizando extração e salvando tudo no formato JSON...`);
            const arquivo = 'historico_conversas.json';

            // Grava tudo no arquivo final, com UTF-8 para garantir os acentos (ã, é, í)
            fs.writeFileSync(arquivo, JSON.stringify(historico_completo, null, 2), 'utf8');

            console.log(`\n🎉🎉 SUCESSO ABSOLUTO! O arquivo "${arquivo}" foi gerado nesta mesma pasta.`);
            console.log(`Total de conversas exportadas com sucesso: ${historico_completo.length}`);
            console.log(`Você agora pode pegar esse arquivo JSON e treinar o seu sistema de RAG (FAQ)!`);

            process.exit(0);

        } catch (error) {
            console.error('\n[❌] ERRO FATAL no processo. O WhatsApp forçou uma atualização ou caiu:', error);
            process.exit(1);
        }
    });

    console.log('[SISTEMA] Dando partida no motor do Puppeteer (Isso pode levar até 1 minuto na primeira vez)...');
    client.initialize();
}

// Inicializa mostrando o menu bonitinho
menuInicial();
