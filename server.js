const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');

// Configuração segura da chave via Variável de Ambiente no Render
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = express();
app.use(cors());
app.use(express.json());

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const CV_DOMAIN = "lcm";
const CV_EMAIL = "iasmin.fernandes@lcmconstrucao.com.br";
const CV_TOKEN = "8448ba5c8e53867a8665bb6e10cbb39b8ccdc922";

const MAPA_DOCUMENTOS = {
    "extrato": 4, "certidao": 5, "holerite": 6, "auto_renda": 6,
    "sem_ocup_ctps": 6, "endereco": 7, "ir": 8, "frente": 10,
    "verso": 10, "ctps": 11, "ccmei": 11, "despesas_anexo": 22, "apos": 23
};

// --- Auxiliares ---
const limparFormatacao = (texto) => texto ? String(texto).replace(/\D/g, '') : "";
const formatarValor = (valor) => {
    try {
        if (!valor) return "0";
        const num = String(valor).replace(",", ".");
        return String(Math.floor(parseFloat(num)));
    } catch (e) { return "0"; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function baixarEConverterBase64(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (error) { return null; }
}

// --- Lógica Principal ---
async function buscarDadosEMontarPayload(propostaId) {
    const docSnap = await db.collection('propostas').doc(propostaId).get();
    if (!docSnap.exists) return { payload: null, cpf: null };

    const dadosFb = docSnap.data();
    const entidades = dadosFb.entidades || {};
    const main = entidades.main || {};
    const dadosPessoais = main.dados_pessoais || {};
    const moradia = main.moradia || {};
    const ocupacaoMain = main.ocupacao || {};

    // 🕵️ SOLUÇÃO PARA O ERRO DE EMAIL VAZIO
    // Busca em 3 níveis: dados_pessoais -> main -> raiz do documento
    let userEmail = (dadosPessoais.email || main.email || dadosFb.email || "").trim();

    let rendaTotal = 0.0;
    for (const key in entidades) {
        const renda = entidades[key]?.ocupacao?.renda_media || 0;
        const valorParse = parseFloat(String(renda).replace(",", "."));
        if (!isNaN(valorParse)) rendaTotal += valorParse;
    }

    const cpf = limparFormatacao(dadosPessoais.cpf);
    const payload = {
        idempreendimento: 15,
        idcorretor: 955,
        valor_avaliacao: "210000.00",
        pausar_hook: true,
        observacoes: `ENVIO AUTOMATICO - FIREBASE ID: ${propostaId}`,
        codigointerno: propostaId,
        pessoa: {
            idpessoa: dadosFb.idPessoaCV || null,
            documento_tipo: "cpf",
            documento: cpf,
            nome: (dadosPessoais.nome || "Cliente Sem Nome").trim(),
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
            remuneracao_bruta: formatarValor(ocupacaoMain.renda_media),
            renda_familiar: formatarValor(rendaTotal)
        }
    };
    return { payload, cpf };
}

async function criarEObterIdPrecadastro(payload, cpf) {
    const headers = { "email": CV_EMAIL, "token": CV_TOKEN, "Content-Type": "application/json", "Accept": "application/json" };
    const urlPost = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro`;
    const urlGet = `https://${CV_DOMAIN}.cvcrm.com.br/api/v1/comercial/precadastro/${cpf}`;

    try {
        console.log(`🚀 Enviando CPF ${cpf} para o CV...`);
        try {
            await axios.post(urlPost, payload, { headers });
        } catch (e) { console.log("Aviso: Cadastro pode já existir."); }

        await sleep(5000); // Tempo para o CV processar

        const resGet = await axios.get(urlGet, { headers });
        const lista = resGet.data.precadastros || [];
        if (lista.length > 0) {
            lista.sort((a, b) => new Date(b.data_cad) - new Date(a.data_cad));
            return { idCv: lista[0].idprecadastro, idPessoa: lista[0].idpessoa };
        }
        return null;
    } catch (err) {
        console.error("Erro na API CV:", err.response?.data || err.message);
        return null;
    }
}

// Rotas
app.post('/api/enviar-cv', async (req, res) => {
    const { propostaId } = req.body;
    try {
        const { payload, cpf } = await buscarDadosEMontarPayload(propostaId);
        const idsCV = await criarEObterIdPrecadastro(payload, cpf);
        if (!idsCV) throw new Error("Não foi possível localizar o cadastro no CV.");

        await db.collection('propostas').doc(propostaId).update({
            idPrecCadastroCV: idsCV.idCv,
            idPessoaCV: idsCV.idPessoa
        });

        res.json({ sucesso: true, idCv: idsCV.idCv });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server ON porta ${PORT}`));
