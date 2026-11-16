import { useEffect, useState } from "react";
import { ChartBar, Gift, PackageOpen, Plus, Target, Trash2, Wallet } from "lucide-react";
import type { BroadcastState } from "./ControlBar";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { Button, Dialog, Field, IconButton } from "../ui";

/*
  Tab "Alat" — Goal, Poll, Wishes, Treasure Box untuk penonton (docs/live-interact.md). Keadaan dari
  proses utama (event `interact`), aksi lewat IPC `interact.*`. Mulai butuh live; tombolnya nonaktif
  dengan alasan tertulis, bukan tombol mati.
*/

type Goal = { id: string; kind: "coins" | "gifts" | "followers" | "members"; target: number; title: string | null; value: number; reached: boolean };
type Poll = { id: string; question: string; options: { text: string; votes: number }[]; endsAt: string; closedAt: string | null; closed: boolean };
type Wish = { id: string; giftId: string; name: string; target: number; value: number };
type Box = { id: string; coins: number; slots: number; claimed: number; audience: "all" | "followers"; opensAt: string; closesAt: string; status: string; claimedCoins?: number };
type State = { live: boolean; goal: Goal | null; poll: Poll | null; wishes: Wish[]; treasure: Box | null } | null;
type Result = { ok: true } | { ok: false; code: string };
type CatalogGift = { id: string; name: string; coinPrice: number };

const GOAL_KINDS = ["coins", "gifts", "followers", "members"] as const;
const POLL_DURATIONS = [30, 60, 120, 300, 600];
const COUNTDOWNS = [60, 180, 300, 600];
const ERROR_CODES = new Set(["not_live", "already_active", "blocked_term", "insufficient_coins", "invalid_input", "maintenance", "economy_migrating"]);

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const left = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export function ToolsPanel({ broadcast }: { broadcast: BroadcastState }) {
  const { t, locale } = useT();
  const state = useMainState<State>("interact", "interact.get", null);
  const [dialog, setDialog] = useState<"goal" | "poll" | "wishes" | "treasure" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const nf = new Intl.NumberFormat(locale);
  // Server yang memutuskan `not_live` (status channel), studio menyiarkan = segera live juga.
  const live = Boolean(state?.live) || broadcast.phase === "live" || broadcast.phase === "reconnecting";

  const errText = (code: string) => t(ERROR_CODES.has(code) ? `studio.app.tools.err.${code}` : "studio.app.tools.err.generic");
  const run = async (channel: string, ...args: unknown[]) => {
    const r = await window.studio.invoke<Result>(channel, ...args);
    setError(r.ok ? null : errText(r.code));
    return r.ok;
  };

  const StartButton = ({ kind }: { kind: "goal" | "poll" | "wishes" | "treasure" }) => (
    <Button size="sm" variant="primary" disabled={!live} title={live ? undefined : t("studio.app.tools.needLive")} onClick={() => setDialog(kind)}>
      {t("studio.app.tools.start")}
    </Button>
  );

  const goal = state?.goal ?? null;
  const poll = state?.poll && !(state.poll.closed && now - Date.parse(state.poll.closedAt ?? state.poll.endsAt) > 30_000) ? state.poll : null;
  // Peti yang selesai tetap tampil 30 dtk (sama dengan web & Android), lalu kartunya kembali kosong.
  const rawBox = state?.treasure ?? null;
  const boxEnd = rawBox ? (rawBox.status === "settled" || rawBox.status === "cancelled" ? Date.parse((rawBox as Box & { settledAt?: string | null }).settledAt ?? rawBox.closesAt) : Date.parse(rawBox.closesAt)) : 0;
  const box = rawBox && !(now > boxEnd && now - boxEnd > 30_000) ? rawBox : null;
  const boxOpen = box && box.status !== "settled" && box.status !== "cancelled" && now < Date.parse(box.closesAt);

  return (
    <div className="tools" role="tabpanel" id="panel-tools" aria-labelledby="tab-tools">
      {!live && <p className="hint tools-need-live">{t("studio.app.tools.needLive")}</p>}
      {error && (
        <p className="msg-warn" role="alert">
          {error}
        </p>
      )}

      <article className="tool-card">
        <header className="tool-head">
          <Target aria-hidden />
          <h3>{t("studio.app.tools.goal.title")}</h3>
          {goal ? (
            <Button size="sm" variant="secondary" onClick={() => void run("interact.goal.end")}>
              {t("studio.app.tools.end")}
            </Button>
          ) : (
            <StartButton kind="goal" />
          )}
        </header>
        {goal ? (
          <>
            <p className="tool-line">{goal.title ?? t(`studio.app.tools.goal.kind.${goal.kind}`)}</p>
            <progress className="tool-progress" value={Math.min(goal.value, goal.target)} max={goal.target} />
            <p className="tool-meta tabular">{goal.reached ? t("studio.app.tools.goal.reached") : t("studio.app.tools.progress", { value: nf.format(goal.value), target: nf.format(goal.target) })}</p>
          </>
        ) : (
          <p className="hint">{t("studio.app.tools.goal.hint")}</p>
        )}
      </article>

      <article className="tool-card">
        <header className="tool-head">
          <ChartBar aria-hidden />
          <h3>{t("studio.app.tools.poll.title")}</h3>
          {poll && !poll.closed ? (
            <Button size="sm" variant="secondary" onClick={() => void run("interact.poll.close")}>
              {t("studio.app.tools.end")}
            </Button>
          ) : (
            <StartButton kind="poll" />
          )}
        </header>
        {poll ? (
          <>
            <p className="tool-line">{poll.question}</p>
            <ul className="tool-list">
              {poll.options.map((o, i) => (
                <li key={i}>
                  <span>{o.text}</span>
                  <span className="tabular muted">{t("studio.app.tools.poll.votes", { count: nf.format(o.votes) })}</span>
                </li>
              ))}
            </ul>
            <p className="tool-meta tabular">{poll.closed ? t("studio.app.tools.ended") : clock(left(poll.endsAt, now))}</p>
          </>
        ) : (
          <p className="hint">{t("studio.app.tools.poll.hint")}</p>
        )}
      </article>

      <article className="tool-card">
        <header className="tool-head">
          <Gift aria-hidden />
          <h3>{t("studio.app.tools.wishes.title")}</h3>
          {state?.wishes.length ? (
            <Button size="sm" variant="secondary" onClick={() => void run("interact.wishes.set", [])}>
              {t("studio.app.tools.end")}
            </Button>
          ) : (
            <StartButton kind="wishes" />
          )}
        </header>
        {state?.wishes.length ? (
          <ul className="tool-list">
            {state.wishes.map((w) => (
              <li key={w.id}>
                <span>{w.name}</span>
                <span className="tabular muted">{t("studio.app.tools.progress", { value: nf.format(w.value), target: nf.format(w.target) })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t("studio.app.tools.wishes.hint")}</p>
        )}
      </article>

      <article className="tool-card">
        <header className="tool-head">
          <PackageOpen aria-hidden />
          <h3>{t("studio.app.tools.treasure.title")}</h3>
          {!boxOpen && <StartButton kind="treasure" />}
        </header>
        {box ? (
          <>
            <p className="tool-line tabular">{t("studio.app.tools.treasure.summary", { coins: nf.format(box.coins), slots: nf.format(box.slots) })}</p>
            <p className="tool-meta tabular">
              {box.status === "settled" || box.status === "cancelled" || !boxOpen
                ? t("studio.app.tools.ended")
                : now < Date.parse(box.opensAt)
                  ? t("studio.app.tools.treasure.opensIn", { time: clock(left(box.opensAt, now)) })
                  : t("studio.app.tools.treasure.openFor", { time: clock(left(box.closesAt, now)) })}
            </p>
            <p className="tool-meta tabular">{t("studio.app.tools.treasure.claimed", { claimed: nf.format(box.claimed), slots: nf.format(box.slots) })}</p>
          </>
        ) : (
          <p className="hint">{t("studio.app.tools.treasure.hint")}</p>
        )}
      </article>

      {dialog === "goal" && <GoalDialog onClose={() => setDialog(null)} onSubmit={async (input) => (await run("interact.goal.start", input)) && setDialog(null)} />}
      {dialog === "poll" && <PollDialog onClose={() => setDialog(null)} onSubmit={async (input) => (await run("interact.poll.start", input)) && setDialog(null)} />}
      {dialog === "wishes" && <WishesDialog onClose={() => setDialog(null)} onSubmit={async (items) => (await run("interact.wishes.set", items)) && setDialog(null)} />}
      {dialog === "treasure" && <TreasureDialog onClose={() => setDialog(null)} onSubmit={async (input, key) => (await run("interact.treasure.start", input, key)) && setDialog(null)} />}
    </div>
  );
}

function GoalDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { kind: string; target: number; title?: string }) => void }) {
  const { t } = useT();
  const [kind, setKind] = useState<(typeof GOAL_KINDS)[number]>("coins");
  const [target, setTarget] = useState("1000");
  const [title, setTitle] = useState("");
  const n = Number(target);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100_000_000 && title.trim().length <= 60;
  return (
    <Dialog
      title={t("studio.app.tools.goal.title")}
      onClose={onClose}
      footer={
        <Button variant="primary" disabled={!valid} onClick={() => onSubmit({ kind, target: n, ...(title.trim() ? { title: title.trim() } : {}) })}>
          {t("studio.app.tools.start")}
        </Button>
      }
    >
      <Field label={t("studio.app.tools.goal.kindLabel")}>
        {(id) => (
          <select id={id} className="input" value={kind} onChange={(e) => setKind(e.target.value as (typeof GOAL_KINDS)[number])}>
            {GOAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`studio.app.tools.goal.kind.${k}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t("studio.app.tools.goal.target")}>{(id) => <input id={id} className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} />}</Field>
      <Field label={t("studio.app.tools.goal.name")} hint={t("studio.app.tools.goal.nameHint")}>
        {(id) => <input id={id} className="input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

function PollDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { question: string; options: string[]; durationSec: number }) => void }) {
  const { t } = useT();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState(60);
  const clean = options.map((o) => o.trim());
  const valid = question.trim().length > 0 && clean.every((o) => o.length > 0);
  return (
    <Dialog
      title={t("studio.app.tools.poll.title")}
      onClose={onClose}
      footer={
        <Button variant="primary" disabled={!valid} onClick={() => onSubmit({ question: question.trim(), options: clean, durationSec: duration })}>
          {t("studio.app.tools.start")}
        </Button>
      }
    >
      <Field label={t("studio.app.tools.poll.question")}>{(id) => <input id={id} className="input" maxLength={100} value={question} onChange={(e) => setQuestion(e.target.value)} />}</Field>
      {options.map((o, i) => (
        <div key={i} className="tool-row">
          <Field label={t("studio.app.tools.poll.option", { n: i + 1 })}>
            {(id) => <input id={id} className="input" maxLength={40} value={o} onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))} />}
          </Field>
          {options.length > 2 && <IconButton label={t("studio.app.tools.remove")} icon={<Trash2 aria-hidden />} onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} />}
        </div>
      ))}
      {options.length < 4 && (
        <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => setOptions((prev) => [...prev, ""])}>
          {t("studio.app.tools.poll.addOption")}
        </Button>
      )}
      <Field label={t("studio.app.tools.duration")}>
        {(id) => (
          <select id={id} className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {POLL_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? t("studio.app.tools.seconds", { n: d }) : t("studio.app.tools.minutes", { n: d / 60 })}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Dialog>
  );
}

function WishesDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (items: { giftId: string; target: number }[]) => void }) {
  const { t, locale } = useT();
  const [gifts, setGifts] = useState<CatalogGift[] | null>(null);
  const [items, setItems] = useState<{ giftId: string; target: string }[]>([]);
  const nf = new Intl.NumberFormat(locale);
  useEffect(() => {
    void window.studio.invoke<CatalogGift[]>("interact.gifts").then((list) => {
      setGifts(list);
      if (list[0]) setItems([{ giftId: list[0].id, target: "5" }]);
    });
  }, []);
  const ids = items.map((i) => i.giftId);
  const valid = items.length > 0 && new Set(ids).size === ids.length && items.every((i) => Number(i.target) >= 1 && Number(i.target) <= 999);
  return (
    <Dialog
      title={t("studio.app.tools.wishes.title")}
      onClose={onClose}
      footer={
        <Button variant="primary" disabled={!valid} onClick={() => onSubmit(items.map((i) => ({ giftId: i.giftId, target: Number(i.target) })))}>
          {t("studio.app.tools.start")}
        </Button>
      }
    >
      {gifts !== null && gifts.length === 0 && <p className="hint">{t("studio.app.tools.wishes.none")}</p>}
      {items.map((item, i) => (
        <div key={i} className="tool-row">
          <Field label={t("studio.app.tools.wishes.gift")}>
            {(id) => (
              <select id={id} className="input" value={item.giftId} onChange={(e) => setItems((prev) => prev.map((p, j) => (j === i ? { ...p, giftId: e.target.value } : p)))}>
                {(gifts ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {t("studio.app.tools.wishes.option", { name: g.name, coins: nf.format(g.coinPrice) })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("studio.app.tools.goal.target")}>
            {(id) => <input id={id} className="input tool-num" inputMode="numeric" value={item.target} onChange={(e) => setItems((prev) => prev.map((p, j) => (j === i ? { ...p, target: e.target.value.replace(/\D/g, "").slice(0, 3) } : p)))} />}
          </Field>
          {items.length > 1 && <IconButton label={t("studio.app.tools.remove")} icon={<Trash2 aria-hidden />} onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} />}
        </div>
      ))}
      {gifts && gifts.length > items.length && items.length < 3 && (
        <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => setItems((prev) => [...prev, { giftId: gifts.find((g) => !ids.includes(g.id))?.id ?? gifts[0]!.id, target: "5" }])}>
          {t("studio.app.tools.wishes.add")}
        </Button>
      )}
    </Dialog>
  );
}

function TreasureDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { coins: number; slots: number; countdownSec: number; audience: string }, key: string) => void }) {
  const { t, locale } = useT();
  // Satu kunci per dialog: mencoba ulang (jaringan putus) tidak memotong koin dua kali.
  const [key] = useState(() => crypto.randomUUID());
  const [coins, setCoins] = useState("1000");
  const [slots, setSlots] = useState("10");
  const [countdown, setCountdown] = useState(60);
  const [audience, setAudience] = useState<"all" | "followers">("all");
  const [balance, setBalance] = useState<number | null>(null);
  const nf = new Intl.NumberFormat(locale);
  useEffect(() => {
    void window.studio.invoke<number | null>("interact.wallet").then(setBalance);
  }, []);
  const c = Number(coins);
  const s = Number(slots);
  const valid = Number.isInteger(c) && c >= 1000 && c <= 1_000_000 && Number.isInteger(s) && s >= 1 && s <= 50 && c >= s;
  const short = balance !== null && c > balance;
  return (
    <Dialog
      title={t("studio.app.tools.treasure.title")}
      onClose={onClose}
      footer={
        <Button variant="primary" disabled={!valid || short} onClick={() => onSubmit({ coins: c, slots: s, countdownSec: countdown, audience }, key)}>
          {t("studio.app.tools.start")}
        </Button>
      }
    >
      <Field label={t("studio.app.tools.treasure.coins")} hint={t("studio.app.tools.treasure.coinsHint")}>
        {(id) => <input id={id} className="input" inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value.replace(/\D/g, "").slice(0, 7))} />}
      </Field>
      <Field label={t("studio.app.tools.treasure.slots")} hint={t("studio.app.tools.treasure.slotsHint")}>
        {(id) => <input id={id} className="input" inputMode="numeric" value={slots} onChange={(e) => setSlots(e.target.value.replace(/\D/g, "").slice(0, 2))} />}
      </Field>
      <Field label={t("studio.app.tools.treasure.countdown")}>
        {(id) => (
          <select id={id} className="input" value={countdown} onChange={(e) => setCountdown(Number(e.target.value))}>
            {COUNTDOWNS.map((d) => (
              <option key={d} value={d}>
                {t("studio.app.tools.minutes", { n: d / 60 })}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t("studio.app.tools.treasure.audience")}>
        {(id) => (
          <select id={id} className="input" value={audience} onChange={(e) => setAudience(e.target.value as "all" | "followers")}>
            <option value="all">{t("studio.app.tools.treasure.audienceAll")}</option>
            <option value="followers">{t("studio.app.tools.treasure.audienceFollowers")}</option>
          </select>
        )}
      </Field>
      <p className="tool-confirm">
        <Wallet aria-hidden />
        <span className="tabular">{balance === null ? t("studio.app.tools.treasure.balanceUnknown") : t("studio.app.tools.treasure.balance", { coins: nf.format(balance) })}</span>
      </p>
      {valid && !short && <p className="hint">{t("studio.app.tools.treasure.confirm", { coins: nf.format(c) })}</p>}
      {short && (
        <div className="msg-warn">
          <p>{t("studio.app.tools.err.insufficient_coins")}</p>
          <Button size="sm" variant="secondary" onClick={() => void window.studio.invoke("open.web", "/wallet/")}>
            {t("studio.app.tools.treasure.topup")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
