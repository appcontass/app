const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('./key.json');
require('dotenv').config();
const app = express();
app.use(cors());
app.use(express.json());

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// 👉 ADICIONE ESTA LINHA AQUI:
const db = admin.firestore();

// Importa as variáveis de ambiente (útil para rodar localmente depois)
const CV_DOMAIN = process.env.CV_DOMAIN;
const CV_EMAIL = process.env.CV_EMAIL;
const CV_TOKEN = process.env.CV_TOKEN;

const MAPA_DOCUMENTOS = {
    "extrato": 4, "certidao": 5, "holerite": 6, "auto_renda": 6,
    "sem_ocup_ctps": 6, "endereco": 7, "ir": 8, "frente": 10,
    "verso": 10, "ctps": 11, "ccmei": 11, "despesas_anexo": 22, "apos": 23
};

// --- Funções Auxiliares ---
function limparFormatacao(texto) { return texto ? String(texto).replace(/\D/g, '') : ""; }

function formatarValor(valor) {
    try {
        if (!valor) return "0";
        const num = String(valor).replace(",", ".");
        return String(Math.floor(parseFloat(num)));
    } catch (e) { return "0"; }
}

async function baixarEConverterBase64(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (error) { return null; }
}

// --- Lógica de Envio ---
app.post('/api/enviar-cv', async (req, res) => {
    const { propostaId } = req.body;
    if (!propostaId) return res.status(400).json({ erro: "ID da proposta não fornecido." });

    try {
        const docSnap = await db.collection('propostas').doc(propostaId).get();
        if (!docSnap.exists) throw new Error("Proposta não encontrada no Firebase.");

        const dadosFb = docSnap.data();
        const entidades = dadosFb.entidades || {};
        const main = entidades.main || {};
        const dp = main.dados_pessoais || {};
        const moradia = main.moradia || {};
        const ocupacaoMain = main.ocupacao || {};

        // --- CÁLCULO DA RENDA FAMILIAR ---
        let rendaTotal = 0.0;
        for (const key in entidades) {
            const renda = entidades[key]?.ocupacao?.renda_media || 0;
            const valorParse = parseFloat(String(renda).replace(",", "."));
            if (!isNaN(valorParse)) rendaTotal += valorParse;
        }

        const cpfLimpo = limparFormatacao(dp.cpf);
        if (!cpfLimpo) throw new Error("CPF do cliente está vazio.");

        // --- BUSCAR E-MAIL DO USUÁRIO NO FIREBASE AUTH ---
        let emailFinal = dp.email || dadosFb.email || ""; 
        
        if (dadosFb.userId) {
            try {
                // Busca os dados de autenticação usando o userId salvo na proposta
                const userRecord = await admin.auth().getUser(dadosFb.userId);
                if (userRecord.email) {
                    emailFinal = userRecord.email;
                    console.log(`📧 E-mail capturado do Firebase Auth: ${emailFinal}`);
                }
            } catch (authErr) {
                console.log(`⚠️ Aviso: Não foi possível buscar o e-mail no Auth para o userId ${dadosFb.userId}. Erro: ${authErr.message}`);
            }
        }

        // Fallback de segurança para não tomar erro 400 de 'email_vazio' no CV CRM
        if (!emailFinal || emailFinal.trim() === "") {
            emailFinal = `cliente_${cpfLimpo}@lcmconstrucao.com.br`;
            console.log(`⚠️ E-mail vazio após busca no Auth. Usando e-mail gerado para evitar bloqueio: ${emailFinal}`);
        }

        // --- MONTAGEM DO PAYLOAD COMPLETO ---
        const payload = {
            idempreendimento: 15,
            idcorretor: 955,
            valor_avaliacao: "210000.00",
            pausar_hook: true,
            observacoes: `ENVIO AUTOMATICO - FIREBASE ID: ${propostaId}`,
            pessoa: {
                idpessoa: dadosFb.idPessoaCV || null,
                documento_tipo: "cpf",
                documento: cpfLimpo,
                nome: (dp.nome || "").trim(),
                email: emailFinal, // <--- E-mail capturado do Auth inserido aqui
                telefone: limparFormatacao(dp.celular),
                celular: limparFormatacao(dp.celular),
                data_nasc: dp.nascimento || "",
                sexo: dp.sexo || 'M',
                cep: limparFormatacao(moradia.cep),
                endereco: moradia.rua || "",
                bairro: moradia.bairro || "",
                numero: moradia.numero || "",
                estado: moradia.uf || "",
                cidade: moradia.cidade || "",
                profissao: ocupacaoMain.cargo || 'Não Informado',
                trabalho_nome_empresa: ocupacaoMain.empresa || 'Não Informada',
                remuneracao_bruta: formatarValor(ocupacaoMain.renda_media),
                renda_familiar: formatarValor(rendaTotal)
            }
        };

        const headers = { 
            "email": CV_EMAIL, 
            "token": CV_TOKEN, 
            "Content-Type": "application/json", 
            "Accept": "application/json" 
        };

        // 1. Criar no CV (POST)
        console.log(`🚀 Enviando payload completo para CPF: ${cpfLimpo}`);
        try {
            await axios.post(`https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro`, payload, { headers });
            console.log("✅ Dados enviados ao CV.");
        } catch (e) {
            console.log("⚠️ Aviso no POST de criação:", e.response?.data || e.message);
        }

        console.log("⏳ Aguardando sincronização...");
        await new Promise(r => setTimeout(r, 5000)); 

        // 2. Buscar IDs gerados (GET)
        let resGet;
        try {
            resGet = await axios.get(`https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/${cpfLimpo}`, { headers });
        } catch (e) {
            if (e.response && e.response.status === 404) {
                throw new Error("O cadastro não foi encontrado no CV. Verifique os logs do POST de criação acima para ver se algum dado (como e-mail ou nome) foi rejeitado.");
            }
            throw e;
        }
        
        const lista = resGet.data?.precadastros || [];
        if (lista.length === 0) throw new Error("Cadastro não localizado no CV após envio.");

        lista.sort((a, b) => new Date(b.data_cad) - new Date(a.data_cad));
        const idCv = lista[0].idprecadastro;
        const idPessoa = lista[0].idpessoa || null;

        // 3. Atualizar Firebase
        console.log(`💾 Salvando ID ${idCv} no Firebase...`);
        const updateData = { idPrecCadastroCV: idCv };
        if (idPessoa) updateData.idPessoaCV = idPessoa;
        await db.collection('propostas').doc(propostaId).update(updateData);

        // 4. Enviar Documentos
        console.log("📄 Processando documentos...");
        const urlsData = dadosFb.documentos_urls || {};
        for (const [campo, valor] of Object.entries(urlsData)) {
            const urlFinal = Array.isArray(valor) ? valor[0] : valor;
            let idTipoDoc = null;

            for (const [key, id] of Object.entries(MAPA_DOCUMENTOS)) {
                if (campo.includes(key)) { idTipoDoc = id; break; }
            }

            if (idTipoDoc && urlFinal) {
                const base64 = await baixarEConverterBase64(urlFinal);
                if (base64) {
                    await axios.post(`https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/documentos`, {
                        idprecadastro: idCv, idtipo: idTipoDoc, documento_base64: base64
                    }, { headers }).catch(e => console.error(`❌ Erro doc [${campo}]:`, e.response?.data || e.message));
                }
            }
        }

        return res.json({ sucesso: true, idCv });

    } catch (error) {
        console.error("❌ Erro Geral:", error.message);
        return res.status(500).json({ erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
