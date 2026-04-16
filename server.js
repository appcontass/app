// localhost

// const express = require('express');
// const cors = require('cors');
// const admin = require('firebase-admin');
// const axios = require('axios');
// const serviceAccount = require('./key.json'); // Sua chave do Firebase Admin

// const app = express();
// app.use(cors()); // Permite que seu front-end chame esta API
// app.use(express.json());

// // Inicialização Firebase
// if (!admin.apps.length) {
//     admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
// }
// const db = admin.firestore();

// // --- Configurações CV CRM ---
// const CV_DOMAIN = "lcm";
// const CV_EMAIL = "iasmin.fernandes@lcmconstrucao.com.br";
// const CV_TOKEN = "8448ba5c8e53867a8665bb6e10cbb39b8ccdc922";

// const MAPA_DOCUMENTOS = {
//     "extrato":        { id: 4,  label: "Extrato" },
//     "certidao":       { id: 5,  label: "Certidão" },
//     "holerite":       { id: 6,  label: "Holerite" },
//     "auto_renda":     { id: 6,  label: "Auto Renda" },
//     "sem_ocup_ctps":  { id: 6,  label: "Sem Ocupação CTPS" },
//     "endereco":       { id: 7,  label: "Endereço" },
//     "ir":             { id: 8,  label: "Imposto de Renda" },
//     "frente":         { id: 10, label: "Documento Frente" },
//     "verso":          { id: 10, label: "Documento Verso" },
//     "ctps":           { id: 11, label: "CTPS" },
//     "ccmei":          { id: 11, label: "CCMEI" },
//     "despesas_anexo": { id: 22, label: "Anexo Despesas" },
//     "apos":           { id: 23, label: "Aposentadoria" }
// };

// // --- Funções Auxiliares ---
// function limparFormatacao(texto) { 
//     return texto ? String(texto).replace(/\D/g, '') : ""; 
// }

// function formatarValor(valor) {
//     try {
//         if (!valor) return "0";
//         const num = String(valor).replace(",", ".");
//         return String(Math.floor(parseFloat(num)));
//     } catch (e) { return "0"; }
// }

// const sleep = ms => new Promise(r => setTimeout(r, ms));

// async function baixarEConverterBase64(url) {
//     try {
//         const response = await axios.get(url, { responseType: 'arraybuffer' });
//         return Buffer.from(response.data, 'binary').toString('base64');
//     } catch (error) {
//         console.error("Erro Base64 ao baixar arquivo:", error.message);
//         return null;
//     }
// }

// // --- Funções Principais de Integração ---
// async function buscarDadosEMontarPayload(propostaId) {
//     const docSnap = await db.collection('propostas').doc(propostaId).get();
//     if (!docSnap.exists) return { payload: null, cpf: null };

//     const dadosFb = docSnap.data();
//     const entidades = dadosFb.entidades || {};
//     const main = entidades.main || {};
//     const dadosPessoais = main.dados_pessoais || {};
//     const moradia = main.moradia || {};
//     const ocupacaoMain = main.ocupacao || {};

//     let rendaTotal = 0.0;
//     for (const key in entidades) {
//         const renda = entidades[key]?.ocupacao?.renda_media || 0;
//         const valorParse = parseFloat(String(renda).replace(",", "."));
//         if (!isNaN(valorParse)) rendaTotal += valorParse;
//     }

//     const cpf = limparFormatacao(dadosPessoais.cpf);
//     const userEmail = dadosPessoais.email || dadosFb.email || "";

//     const payload = {
//         idempreendimento: 15, 
//         idcorretor: 955, 
//         valor_avaliacao: "210000.00", 
//         pausar_hook: true,
//         observacoes: `ENVIO AUTOMATICO - FIREBASE ID: ${propostaId}`,
//         codigointerno: propostaId,
//         pessoa: {
//             idpessoa: dadosFb.idPessoaCV || null, // <--- ADICIONE ESTA LINHA (Pega do Firebase)
//             documento_tipo: "cpf", 
//             documento: cpf, 
//             nome: (dadosPessoais.nome || "").trim(),
//             email: userEmail, 
//             telefone: limparFormatacao(dadosPessoais.celular), 
//             celular: limparFormatacao(dadosPessoais.celular),
//             data_nasc: dadosPessoais.nascimento, 
//             sexo: dadosPessoais.sexo || 'M', 
//             cep: limparFormatacao(moradia.cep),
//             endereco: moradia.rua, 
//             bairro: moradia.bairro, 
//             numero: moradia.numero, 
//             estado: moradia.uf, 
//             cidade: moradia.cidade,
//             profissao: ocupacaoMain.cargo || 'Não Informado', 
//             trabalho_nome_empresa: ocupacaoMain.empresa || 'Não Informada',
//             remuneracao_bruta: formatarValor(ocupacaoMain.renda_media), 
//             renda_familiar: formatarValor(rendaTotal)
//         }
//     };
//     return { payload, cpf };
// }

// async function criarEObterIdPrecadastro(payload, cpf) {
//     const urlPost = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro`;
//     const urlGet = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/${cpf}`;
//     const headers = { "email": CV_EMAIL, "token": CV_TOKEN, "Content-Type": "application/json", "Accept": "application/json" };

//     try {
//         try {
//             await axios.post(urlPost, payload, { headers });
//         } catch (postError) { 
//             console.log("Aviso: Cadastro já existe ou erro no POST."); 
//         }

//         console.log("⏳ Aguardando sincronização CV...");
//         await sleep(4000); 

//         const resGet = await axios.get(urlGet, { headers });
//         if (resGet.status === 200 && resGet.data) {
//             const lista = resGet.data.precadastros || [];
//             if (lista.length > 0) {
//                 lista.sort((a, b) => new Date(b.data_cad) - new Date(a.data_cad));
                
//                 // RETORNA OS DOIS IDS
//                 return { 
//                     idCv: lista[0].idprecadastro, 
//                     idPessoa: lista[0].idpessoa // <--- Captura o idpessoa retornado pelo CV
//                 };
//             }
//         }
//         return null;
//     } catch (err) {
//         console.error("Erro CV:", err.response?.data || err.message);
//         return null;
//     }
// }

// async function enviarDocumentosCv(propostaId, idCv) {
//     const docSnap = await db.collection("propostas").doc(propostaId).get();
//     const urlsData = docSnap.data()?.documentos_urls || {};
//     const urlApi = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/documentos`;
//     const headers = { "email": CV_EMAIL, "token": CV_TOKEN, "Content-Type": "application/json", "Accept": "application/json" };

//     for (const [campo, valor] of Object.entries(urlsData)) {
//         const urlFinal = Array.isArray(valor) && valor.length > 0 ? valor[0] : valor;
//         if (!urlFinal) continue;

//         let idTipo = null;
//         for (const [key, info] of Object.entries(MAPA_DOCUMENTOS)) {
//             if (campo.includes(key)) {
//                 idTipo = info.id; break;
//             }
//         }

//         if (idTipo) {
//             console.log(`Baixando documento: ${campo}...`);
//             const base64Doc = await baixarEConverterBase64(urlFinal);
            
//             if (base64Doc) {
//                 const payload = { idprecadastro: idCv, idtipo: idTipo, documento_base64: base64Doc };
//                 try {
//                     await axios.post(urlApi, payload, { headers });
//                     console.log(`✅ Documento [${campo}] enviado ao CV com sucesso!`);
//                 } catch (err) { 
//                     console.error(`❌ Falha ao enviar doc [${campo}] para API do CV:`, err.response?.data || err.message); 
//                 }
//             }
//         }
//     }
// }

// // ==========================================
// // ROTA 1: CRIAR NO CV (PRIMEIRO ENVIO)
// // ==========================================
// app.post('/api/enviar-cv', async (req, res) => {
//     const { propostaId } = req.body;
//     if (!propostaId) return res.status(400).json({ erro: "ID da proposta não fornecido." });

//     try {
//         const { payload, cpf } = await buscarDadosEMontarPayload(propostaId);
//         if (!payload || !cpf) throw new Error("Dados incompletos no Firebase.");

//         // Agora recebe o objeto com os dois IDs
//         const idsCV = await criarEObterIdPrecadastro(payload, cpf);
//         if (!idsCV) throw new Error("Falha ao criar pré-cadastro no CV.");

//         console.log(`⭐ IDs Localizados: Pré-cadastro: ${idsCV.idCv}, Pessoa: ${idsCV.idPessoa}`);

//         // SALVA AMBOS NO FIREBASE
//         await db.collection('propostas').doc(propostaId).update({ 
//             idPrecCadastroCV: idsCV.idCv,
//             idPessoaCV: idsCV.idPessoa 
//         });
        
//         await enviarDocumentosCv(propostaId, idsCV.idCv);

//         return res.json({ sucesso: true, idCv: idsCV.idCv, mensagem: "Enviado com sucesso!" });

//     } catch (error) {
//         console.error("Erro na rota:", error.message);
//         return res.status(500).json({ erro: error.message });
//     }
// });

// // ==========================================
// // ROTA 2: ATUALIZAR DADOS E DOCS NO CV
// // ==========================================
// app.put('/api/atualizar-cv', async (req, res) => {
//     const { propostaId, idCv } = req.body;

//     if (!propostaId || !idCv) {
//         return res.status(400).json({ erro: "ID da proposta ou do CV ausentes." });
//     }

//     console.log(`🔄 Recebido pedido de ATUALIZAÇÃO CV ID [${idCv}] para Proposta: ${propostaId}`);

//     try {
//         const { payload, cpf } = await buscarDadosEMontarPayload(propostaId);
//         if (!payload || !cpf) throw new Error("Falha ao montar Payload da proposta no Firebase.");

//         const headers = { "email": CV_EMAIL, "token": CV_TOKEN, "Content-Type": "application/json", "Accept": "application/json" };

//         // 1. A SACADA: Usar POST /precadastro para forçar a "modificação da pessoa" (Upsert)
//         console.log("👤 Forçando atualização dos dados da Pessoa via POST de Pré-cadastro...");
//         const urlPostPrecadastro = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro`;
//         try {
//             await axios.post(urlPostPrecadastro, payload, { headers });
//             console.log("✅ Dados da pessoa atualizados com sucesso via POST!");
//         } catch (upsertError) {
//             console.log("⚠️ Aviso: POST de atualização falhou. Erro:", upsertError.response?.data || upsertError.message);
//         }

//         // 2. Garantir atualização dos dados comerciais específicos do ID antigo
//         console.log("✏️ Atualizando dados comerciais do Pré-cadastro específico...");
//         const urlPutPrecadastro = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/${idCv}`;
//         try {
//             // Removemos o objeto "pessoa" do payload para o PUT, já que a documentação dele não aceita e o POST acima já resolveu isso.
//             const payloadSemPessoa = { ...payload };
//             delete payloadSemPessoa.pessoa;
            
//             await axios.put(urlPutPrecadastro, payloadSemPessoa, { headers });
//         } catch (putError) {
//             console.log("⚠️ Aviso: PUT comercial ignorado ou falhou. Erro:", putError.response?.data || putError.message);
//         }
        
//         // 3. Re-enviar os documentos
//         console.log("📤 Re-processando documentos para atualização...");
//         await enviarDocumentosCv(propostaId, idCv);

//         return res.json({ sucesso: true, mensagem: "Atualizado com sucesso!" });
//     } catch (error) {
//         console.error("Erro na atualização CV:", error.response?.data || error.message);
//         return res.status(500).json({ erro: error.message });
//     }
// });

// const PORT = 3000;
// app.listen(PORT, () => {
//     console.log(`✅ Servidor rodando na porta ${PORT}`);
// });


// render
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = express();
app.use(cors()); // Permite que seu front-end chame esta API
app.use(express.json());

// Inicialização Firebase
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// --- Configurações CV CRM ---
const CV_DOMAIN = "lcm";
const CV_EMAIL = "iasmin.fernandes@lcmconstrucao.com.br";
const CV_TOKEN = "8448ba5c8e53867a8665bb6e10cbb39b8ccdc922";
console.log('teste')
const MAPA_DOCUMENTOS = {
    "extrato":        { id: 4,  label: "Extrato" },
    "certidao":       { id: 5,  label: "Certidão" },
    "holerite":       { id: 6,  label: "Holerite" },
    "auto_renda":     { id: 6,  label: "Auto Renda" },
    "sem_ocup_ctps":  { id: 6,  label: "Sem Ocupação CTPS" },
    "endereco":       { id: 7,  label: "Endereço" },
    "ir":             { id: 8,  label: "Imposto de Renda" },
    "frente":         { id: 10, label: "Documento Frente" },
    "verso":          { id: 10, label: "Documento Verso" },
    "ctps":           { id: 11, label: "CTPS" },
    "ccmei":          { id: 11, label: "CCMEI" },
    "despesas_anexo": { id: 22, label: "Anexo Despesas" },
    "apos":           { id: 23, label: "Aposentadoria" }
};

// --- Funções Auxiliares ---
function limparFormatacao(texto) { 
    return texto ? String(texto).replace(/\D/g, '') : ""; 
}

function formatarValor(valor) {
    try {
        if (!valor) return "0";
        const num = String(valor).replace(",", ".");
        return String(Math.floor(parseFloat(num)));
    } catch (e) { return "0"; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function baixarEConverterBase64(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (error) {
        console.error("Erro Base64 ao baixar arquivo:", error.message);
        return null;
    }
}

// --- Funções Principais de Integração ---
async function buscarDadosEMontarPayload(propostaId) {
    const docSnap = await db.collection('propostas').doc(propostaId).get();
    if (!docSnap.exists) return { payload: null, cpf: null };

    const dadosFb = docSnap.data();
    const entidades = dadosFb.entidades || {};
    const main = entidades.main || {};
    const dadosPessoais = main.dados_pessoais || {};
    const moradia = main.moradia || {};
    const ocupacaoMain = main.ocupacao || {};

    let rendaTotal = 0.0;
    for (const key in entidades) {
        const renda = entidades[key]?.ocupacao?.renda_media || 0;
        const valorParse = parseFloat(String(renda).replace(",", "."));
        if (!isNaN(valorParse)) rendaTotal += valorParse;
    }

    const cpf = limparFormatacao(dadosPessoais.cpf);
    const userEmail = dadosPessoais.email || dadosFb.email || "";

    const payload = {
        idempreendimento: 15, 
        idcorretor: 955, 
        valor_avaliacao: "210000.00", 
        pausar_hook: true,
        observacoes: `ENVIO AUTOMATICO - FIREBASE ID: ${propostaId}`,
        codigointerno: propostaId,
        pessoa: {
            idpessoa: dadosFb.idPessoaCV || null, // <--- ADICIONE ESTA LINHA (Pega do Firebase)
            documento_tipo: "cpf", 
            documento: cpf, 
            nome: (dadosPessoais.nome || "").trim(),
            email: userEmail, 
            telefone: limparFormatacao(dadosPessoais.celular), 
            celular: limparFormatacao(dadosPessoais.celular),
            data_nasc: dadosPessoais.nascimento, 
            sexo: dadosPessoais.sexo || 'M', 
            cep: limparFormatacao(moradia.cep),
            endereco: moradia.rua, 
            bairro: moradia.bairro, 
            numero: moradia.numero, 
            estado: moradia.uf, 
            cidade: moradia.cidade,
            profissao: ocupacaoMain.cargo || 'Não Informado', 
            trabalho_nome_empresa: ocupacaoMain.empresa || 'Não Informada',
            remuneracao_bruta: formatarValor(ocupacaoMain.renda_media), 
            renda_familiar: formatarValor(rendaTotal)
        }
    };
    return { payload, cpf };
}

async function criarEObterIdPrecadastro(payload, cpf) {
    const urlPost = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro`;
    const urlGet = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/${cpf}`;
    const headers = { "email": CV_EMAIL, "token": CV_TOKEN, "Content-Type": "application/json", "Accept": "application/json" };

    try {
        try {
            await axios.post(urlPost, payload, { headers });
        } catch (postError) { 
            console.log("Aviso: Cadastro já existe ou erro no POST."); 
        }

        console.log("⏳ Aguardando sincronização CV...");
        await sleep(4000); 

        const resGet = await axios.get(urlGet, { headers });
        if (resGet.status === 200 && resGet.data) {
            const lista = resGet.data.precadastros || [];
            if (lista.length > 0) {
                lista.sort((a, b) => new Date(b.data_cad) - new Date(a.data_cad));
                
                // RETORNA OS DOIS IDS
                return { 
                    idCv: lista[0].idprecadastro, 
                    idPessoa: lista[0].idpessoa // <--- Captura o idpessoa retornado pelo CV
                };
            }
        }
        return null;
    } catch (err) {
        console.error("Erro CV:", err.response?.data || err.message);
        return null;
    }
}

async function enviarDocumentosCv(propostaId, idCv) {
    const docSnap = await db.collection("propostas").doc(propostaId).get();
    const urlsData = docSnap.data()?.documentos_urls || {};
    const urlApi = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/documentos`;
    const headers = { "email": CV_EMAIL, "token": CV_TOKEN, "Content-Type": "application/json", "Accept": "application/json" };

    for (const [campo, valor] of Object.entries(urlsData)) {
        const urlFinal = Array.isArray(valor) && valor.length > 0 ? valor[0] : valor;
        if (!urlFinal) continue;

        let idTipo = null;
        for (const [key, info] of Object.entries(MAPA_DOCUMENTOS)) {
            if (campo.includes(key)) {
                idTipo = info.id; break;
            }
        }

        if (idTipo) {
            console.log(`Baixando documento: ${campo}...`);
            const base64Doc = await baixarEConverterBase64(urlFinal);
            
            if (base64Doc) {
                const payload = { idprecadastro: idCv, idtipo: idTipo, documento_base64: base64Doc };
                try {
                    await axios.post(urlApi, payload, { headers });
                    console.log(`✅ Documento [${campo}] enviado ao CV com sucesso!`);
                } catch (err) { 
                    console.error(`❌ Falha ao enviar doc [${campo}] para API do CV:`, err.response?.data || err.message); 
                }
            }
        }
    }
}

// ==========================================
// ROTA 1: CRIAR NO CV (PRIMEIRO ENVIO)
// ==========================================
app.post('/api/enviar-cv', async (req, res) => {
    const { propostaId } = req.body;
    if (!propostaId) return res.status(400).json({ erro: "ID da proposta não fornecido." });

    try {
        const { payload, cpf } = await buscarDadosEMontarPayload(propostaId);
        if (!payload || !cpf) throw new Error("Dados incompletos no Firebase.");

        // Agora recebe o objeto com os dois IDs
        const idsCV = await criarEObterIdPrecadastro(payload, cpf);
        if (!idsCV) throw new Error("Falha ao criar pré-cadastro no CV.");

        console.log(`⭐ IDs Localizados: Pré-cadastro: ${idsCV.idCv}, Pessoa: ${idsCV.idPessoa}`);

        // SALVA AMBOS NO FIREBASE
        await db.collection('propostas').doc(propostaId).update({ 
            idPrecCadastroCV: idsCV.idCv,
            idPessoaCV: idsCV.idPessoa 
        });
        
        await enviarDocumentosCv(propostaId, idsCV.idCv);

        return res.json({ sucesso: true, idCv: idsCV.idCv, mensagem: "Enviado com sucesso!" });

    } catch (error) {
        console.error("Erro na rota:", error.message);
        return res.status(500).json({ erro: error.message });
    }
});

// ==========================================
// ROTA 2: ATUALIZAR DADOS E DOCS NO CV
// ==========================================
app.put('/api/atualizar-cv', async (req, res) => {
    const { propostaId, idCv } = req.body;

    if (!propostaId || !idCv) {
        return res.status(400).json({ erro: "ID da proposta ou do CV ausentes." });
    }

    console.log(`🔄 Recebido pedido de ATUALIZAÇÃO CV ID [${idCv}] para Proposta: ${propostaId}`);

    try {
        const { payload, cpf } = await buscarDadosEMontarPayload(propostaId);
        if (!payload || !cpf) throw new Error("Falha ao montar Payload da proposta no Firebase.");

        const headers = { "email": CV_EMAIL, "token": CV_TOKEN, "Content-Type": "application/json", "Accept": "application/json" };

        // 1. A SACADA: Usar POST /precadastro para forçar a "modificação da pessoa" (Upsert)
        console.log("👤 Forçando atualização dos dados da Pessoa via POST de Pré-cadastro...");
        const urlPostPrecadastro = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro`;
        try {
            await axios.post(urlPostPrecadastro, payload, { headers });
            console.log("✅ Dados da pessoa atualizados com sucesso via POST!");
        } catch (upsertError) {
            console.log("⚠️ Aviso: POST de atualização falhou. Erro:", upsertError.response?.data || upsertError.message);
        }

        // 2. Garantir atualização dos dados comerciais específicos do ID antigo
        console.log("✏️ Atualizando dados comerciais do Pré-cadastro específico...");
        const urlPutPrecadastro = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/${idCv}`;
        try {
            // Removemos o objeto "pessoa" do payload para o PUT, já que a documentação dele não aceita e o POST acima já resolveu isso.
            const payloadSemPessoa = { ...payload };
            delete payloadSemPessoa.pessoa;
            
            await axios.put(urlPutPrecadastro, payloadSemPessoa, { headers });
        } catch (putError) {
            console.log("⚠️ Aviso: PUT comercial ignorado ou falhou. Erro:", putError.response?.data || putError.message);
        }
        
        // 3. Re-enviar os documentos
        console.log("📤 Re-processando documentos para atualização...");
        await enviarDocumentosCv(propostaId, idCv);

        return res.json({ sucesso: true, mensagem: "Atualizado com sucesso!" });
    } catch (error) {
        console.error("Erro na atualização CV:", error.response?.data || error.message);
        return res.status(500).json({ erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
