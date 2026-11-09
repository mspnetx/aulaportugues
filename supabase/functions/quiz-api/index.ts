import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const hash = async (s: string) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await req.json();
    const action = body.action;
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Serviço não configurado." }, 503);
    const db = createClient(url, key);

    if (action === "start") {
      const code = String(body.access_code || "");
      const configuredCode = Deno.env.get("STUDENT_ACCESS_CODE") || "";
      if (!configuredCode || code !== configuredCode) return json({ error: "Código da prova inválido." }, 403);
      const nickname = String(body.nickname || "Aluno").trim().slice(0, 24) || "Aluno";
      const codeHash = await hash(code);
      let { data: attempt, error: findError } = await db.from("quiz_attempts")
        .select("id,nickname,started_at,finished_at")
        .eq("access_code_hash", codeHash).is("finished_at", null)
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (findError) throw findError;
      if (!attempt) {
        const created = await db.from("quiz_attempts")
          .insert({ nickname, access_code_hash: codeHash }).select("id,nickname,started_at,finished_at").single();
        if (created.error) throw created.error;
        attempt = created.data;
      }
      const { data: answers, error: answerError } = await db.from("quiz_answers")
        .select("question_id,is_correct").eq("attempt_id", attempt.id);
      if (answerError) throw answerError;
      const answered = (answers || []).map(a => a.question_id);
      const score = (answers || []).filter(a => a.is_correct).length;
      const { data: qs, error: questionError } = await db.from("quiz_questions")
        .select("id,module,difficulty,prompt,options").order("id");
      if (questionError) throw questionError;
      return json({ attempt_id: attempt.id, nickname: attempt.nickname, questions: qs, next_index: answered.length, score, answered_ids: answered });
    }

    if (action === "answer") {
      const { attempt_id, question_id, choice } = body;
      if (typeof attempt_id !== "string" || !Number.isInteger(question_id) || ![0, 1, 2, 3].includes(choice))
        return json({ error: "Resposta inválida." }, 400);
      const { data: attempt, error: attemptError } = await db.from("quiz_attempts")
        .select("id,finished_at").eq("id", attempt_id).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt || attempt.finished_at) return json({ error: "Tentativa inexistente ou já finalizada." }, 403);
      const { data: q, error: questionError } = await db.from("quiz_questions")
        .select("correct_index,explanation").eq("id", question_id).maybeSingle();
      if (questionError) throw questionError;
      if (!q) return json({ error: "Questão não encontrada." }, 404);
      const correct = choice === q.correct_index;
      // Insert-only: a mesma questão não pode ser respondida novamente para alterar o resultado.
      const { error: insertError } = await db.from("quiz_answers")
        .insert({ attempt_id, question_id, choice, is_correct: correct });
      if (insertError) {
        if (insertError.code === "23505") return json({ error: "Esta questão já foi respondida." }, 409);
        throw insertError;
      }
      return json({ correct, correct_index: q.correct_index, explanation: q.explanation });
    }

    if (action === "finish") {
      const attemptId = body.attempt_id;
      if (typeof attemptId !== "string") return json({ error: "Tentativa inválida." }, 400);
      const { count, error: countError } = await db.from("quiz_answers")
        .select("id", { count: "exact", head: true }).eq("attempt_id", attemptId);
      if (countError) throw countError;
      if ((count || 0) < 100) return json({ error: "A prova ainda possui questões sem resposta." }, 409);
      const { error } = await db.from("quiz_attempts")
        .update({ finished_at: new Date().toISOString() }).eq("id", attemptId).is("finished_at", null);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "dashboard") {
      const pin = String(body.parent_pin || "");
      const configuredPin = Deno.env.get("PARENT_PIN") || "";
      if (!configuredPin || pin !== configuredPin) return json({ error: "PIN do responsável incorreto." }, 403);
      const { data: attempt, error: attemptError } = await db.from("quiz_attempts")
        .select("id,nickname,started_at,finished_at").order("started_at", { ascending: false })
        .limit(1).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt) return json({ nickname: null, answered: 0, correct: 0, percent: 0, modules: {}, answers: [] });
      const { data: answers, error } = await db.from("quiz_answers")
        .select("question_id,choice,is_correct,created_at,quiz_questions(module)")
        .eq("attempt_id", attempt.id).order("created_at");
      if (error) throw error;
      const modules: Record<number, { correct: number; total: number }> = {};
      for (let i = 1; i <= 8; i++) modules[i] = { correct: 0, total: 0 };
      for (const a of answers || []) {
        const module = a.quiz_questions.module;
        modules[module].total++;
        if (a.is_correct) modules[module].correct++;
      }
      const correct = (answers || []).filter(a => a.is_correct).length;
      return json({
        nickname: attempt.nickname,
        answered: (answers || []).length,
        correct,
        percent: Math.round(correct),
        modules,
        answers: (answers || []).map(a => ({
          question_id: a.question_id, choice: a.choice, correct: a.is_correct,
          created_at: a.created_at, module: a.quiz_questions.module
        }))
      });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("quiz-api:", e);
    return json({ error: "Ocorreu um erro no serviço. Tente novamente." }, 500);
  }
});
