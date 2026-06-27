// netlify/functions/generate.js
// Gera a proposta comercial chamando a API da Anthropic.
// A chave NUNCA fica no HTML — só aqui, via variável de ambiente ANTHROPIC_API_KEY no Netlify.

exports.handler = async (event) => {
  const H = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: H, body: JSON.stringify({ error: "Método não permitido." }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada no Netlify." }) };
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: "Corpo da requisição inválido." }) };
  }

  const {
    clientName = "", company = "", template = "", service = "",
    objective = "", scope = "", deadline = "", value = "",
    notes = "", companyName = ""
  } = input;

  if (!service || !service.trim()) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: "Serviço é obrigatório." }) };
  }

  const system =
    "Você é um especialista sênior em redigir propostas comerciais profissionais, claras e persuasivas em português do Brasil. " +
    "Escreva com tom profissional, confiante e orientado a benefícios para o cliente. " +
    "Responda SOMENTE com um objeto JSON válido, sem markdown, sem crases e sem nenhum texto fora do JSON.";

  const schema = `{
  "coverTitle": "título curto e forte da proposta",
  "coverSubtitle": "subtítulo de uma linha",
  "presentation": "2 a 3 parágrafos de apresentação (separe os parágrafos com \\n)",
  "objectives": ["objetivo 1", "objetivo 2", "objetivo 3"],
  "scope": ["item de escopo 1", "item de escopo 2", "item de escopo 3"],
  "timeline": [{"phase": "Fase 1", "duration": "ex: 2 semanas", "description": "o que acontece nesta fase"}],
  "investmentIntro": "1 a 2 frases introduzindo o investimento",
  "investmentItems": [{"item": "descrição do item/serviço", "value": "R$ 0.000"}],
  "investmentTotal": "R$ 0.000",
  "benefits": ["benefício 1", "benefício 2", "benefício 3"],
  "differentials": ["diferencial 1", "diferencial 2"],
  "nextSteps": ["passo 1", "passo 2", "passo 3"],
  "closing": "parágrafo de encerramento cordial e convidativo"
}`;

  const userMsg =
`Crie uma proposta comercial completa e profissional com base nestes dados:
- Prestador (quem envia a proposta): ${companyName || "não informado"}
- Categoria/Template: ${template || "não informado"}
- Cliente: ${clientName || "não informado"}${company ? " - " + company : ""}
- Serviço: ${service}
- Objetivo: ${objective || "não informado"}
- Escopo descrito: ${scope || "não informado"}
- Prazo: ${deadline || "não informado"}
- Valor / orçamento: ${value || "não informado"}
- Observações: ${notes || "nenhuma"}

Preencha TODOS os campos do JSON de forma coerente, específica e profissional para este serviço.
Se o valor não foi informado, estime itens e total plausíveis para o mercado brasileiro.
Responda SOMENTE com o JSON exatamente neste formato:
${schema}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userMsg }]
      })
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return { statusCode: 502, headers: H, body: JSON.stringify({ error: "Erro na API da Anthropic.", detail }) };
    }

    const data = await resp.json();
    let text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    let content;
    try {
      content = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("A resposta da IA não veio em JSON válido.");
      content = JSON.parse(m[0]);
    }

    return { statusCode: 200, headers: H, body: JSON.stringify({ content }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: "Falha ao gerar a proposta.", detail: String((e && e.message) || e) }) };
  }
};
