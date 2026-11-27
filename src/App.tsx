import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clock3, Copy, Download, ExternalLink, FileText, GraduationCap, History, ImagePlus, Leaf, LoaderCircle, RotateCcw, Search, ShieldCheck, Shuffle, Sparkles, Star, Volume2, X } from 'lucide-react';
import { categories, slangEntries, type SlangEntry } from './slang-data';
import { downloadText, entryText, findSlang, searchEntries, shuffled, type SlangMatch } from './slang-engine';
import { isStringList, usePersistent } from './use-persistent';
import { ErrorBoundary } from './components/error-boundary';
import { recognizeScreenshot, type OcrProgress } from './ocr';

const SAMPLES = [
  { label: 'Работа и учёба', text: '今天又加班了，太内卷了！我只想躺平，偶尔摸鱼。' },
  { label: 'Реакция в чате', text: '这家店的火锅 YYDS！这个视频 xswl，真的绝绝子！' },
  { label: 'Из соцсетей', text: '周末一起 citywalk，顺便干饭！这条视频让我破防了。' },
];
type HistoryItem = { text: string; date: number; count: number };
const isHistory = (v: unknown): v is HistoryItem[] => Array.isArray(v) && v.every(x => x && typeof x.text === 'string' && typeof x.date === 'number' && Number.isFinite(x.date) && typeof x.count === 'number');
type Store = { favorites: string[]; toggleFavorite: (e: SlangEntry) => void; learned: string[]; setLearned: (e: SlangEntry, yes: boolean) => void; history: HistoryItem[]; saveHistory: (text: string, count: number) => void; clearHistory: () => void; openEntry: (entry: SlangEntry) => void; notify: (text: string) => void };
const StoreContext = createContext<Store>(null!);
const useStore = () => useContext(StoreContext);
const validTerms = new Set(slangEntries.map(entry => entry.term));
const categoryName = (entry: SlangEntry) => categories.find(c => c.id === entry.category)?.name;
const dateLabel = (date: number) => new Date(date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function IconButton({ label, children, onClick, active = false }: { label: string; children: ReactNode; onClick: () => void; active?: boolean }) {
  return <button className={`icon-button ${active ? 'is-active' : ''}`} type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function Favorite({ entry }: { entry: SlangEntry }) {
  const { favorites, toggleFavorite } = useStore();
  const saved = favorites.includes(entry.term);
  return <button className={`icon-button favorite-button ${saved ? 'is-active' : ''}`} aria-label={saved ? `Убрать ${entry.term} из избранного` : `Сохранить ${entry.term}`} aria-pressed={saved} onClick={() => toggleFavorite(entry)}><Star fill={saved ? 'currentColor' : 'none'} /></button>;
}

function Speak({ entry }: { entry: SlangEntry }) {
  const { notify } = useStore();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  const speak = () => {
    if (!('speechSynthesis' in window)) { notify('Этот браузер не поддерживает озвучивание. Пиньинь указан в карточке.'); return; }
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('zh'));
    if (!voice) { notify('На устройстве не найден китайский голос. Его можно добавить в настройках речи.'); return; }
    const speech = new SpeechSynthesisUtterance(entry.term.split('/')[0]);
    speech.voice = voice; speech.lang = voice.lang; speech.rate = .8;
    speech.onstart = () => setSpeaking(true);
    speech.onend = () => setSpeaking(false);
    speech.onerror = () => { setSpeaking(false); notify('Не удалось озвучить слово. Попробуйте другой браузер.'); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech);
  };
  return <IconButton label={`Произнести ${entry.term}`} onClick={speak} active={speaking}><Volume2 /></IconButton>;
}

function VibeCheck({ entry }: { entry: SlangEntry }) {
  return <div className="vibe-grid"><div className="vibe-box vibe-green"><span className="vibe-label"><span className="status-dot" />Зелёная зона</span><p>{entry.goodContext}</p></div><div className="vibe-box vibe-red"><span className="vibe-label"><span className="status-dot" />Красная зона</span><p>{entry.badContext}</p></div></div>;
}

function EntryContent({ entry }: { entry: SlangEntry }) {
  return <><div className="meaning-block"><span className="overline">На самом деле</span><p>{entry.meaning}</p><div className="literal">Буквально: {entry.literalTranslation}</div></div><div className="section-caption"><Sparkles />Вайб-чек</div><VibeCheck entry={entry} /><blockquote className="entry-example"><span className="overline">Так говорят</span><p lang="zh">{entry.exampleZh}</p><footer>{entry.exampleRu}</footer></blockquote><div className="entry-source"><FileText />База проекта · запись №{entry.id}</div></>;
}

function EntryModal({ entry, onClose }: { entry: SlangEntry | null; onClose: () => void }) {
  const { notify, favorites, toggleFavorite } = useStore();
  const copy = async () => {
    if (!entry) return;
    try { await navigator.clipboard.writeText(entryText(entry)); notify('Карточка скопирована'); }
    catch { downloadText(`panda-slang-${entry.id}.txt`, entryText(entry)); notify('Карточка сохранена файлом'); }
  };
  return <Dialog.Root open={!!entry} onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="entry-modal" onCloseAutoFocus={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>
    {entry && <><div className="modal-top"><span className="category-label">{categoryName(entry)}</span><Dialog.Close className="icon-button" aria-label="Закрыть карточку"><X /></Dialog.Close></div><Dialog.Title className="modal-word" lang="zh">{entry.term}</Dialog.Title><Dialog.Description className="word-pinyin">{entry.pinyin}</Dialog.Description><div className="entry-toolbar"><button className={`button small ${favorites.includes(entry.term) ? 'button-green' : 'button-outline'}`} onClick={() => toggleFavorite(entry)}><Star size={16} fill={favorites.includes(entry.term) ? 'currentColor' : 'none'} />{favorites.includes(entry.term) ? 'Сохранено' : 'В избранное'}</button><Speak entry={entry} /><IconButton label="Скопировать карточку" onClick={() => void copy()}><Copy /></IconButton></div><EntryContent entry={entry} /></>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function Sidebar() {
  const [path] = useLocation(); const { favorites, learned } = useStore();
  const nav = [{ href: '/', icon: Sparkles, text: 'Разбор текста' }, { href: '/dictionary', icon: BookOpen, text: 'Словарь', count: 200 }, { href: '/saved', icon: Star, text: 'Избранное', count: favorites.length }, { href: '/practice', icon: GraduationCap, text: 'Практика' }];
  return <aside className="sidebar"><Link href="/" className="brand" aria-label="Panda Slang — главная"><span className="brand-seal" lang="zh">熊</span><span className="brand-type">Panda<span>Slang<span className="brand-dot">.</span></span></span></Link><span className="sidebar-kicker">Твой проводник в 中文</span><div className="nav-caption">ИССЛЕДУЙ И ПОНИМАЙ</div><nav className="main-nav" aria-label="Основная навигация">{nav.map(({ href, icon: Icon, text, count }) => <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`} aria-current={path === href ? 'page' : undefined}><Icon /><span>{text}</span>{count !== undefined && <span className="nav-count">{count}</span>}</Link>)}</nav><div className="sidebar-bottom"><div className="sidebar-progress"><span><Leaf />Маленькими шагами</span><strong>{learned.length}<small> / 200 слов изучено</small></strong><div className="mini-progress"><i style={{ width: `${learned.length / 2}%` }} /></div><p>Одно новое слово — уже ближе к пониманию.</p></div><span className="sidebar-foot">СОЗДАНО С ЛЮБОПЫТСТВОМ · 2026</span></div></aside>;
}

function Header() {
  const [path] = useLocation();
  return <header className="topbar"><Link className="mobile-logo" href="/">熊 PandaSlang<span>.</span></Link><div className="breadcrumbs">Panda Slang <span>/</span> {path === '/dictionary' ? 'Словарь' : path === '/saved' ? 'Избранное' : path === '/practice' ? 'Практика' : 'Разбор текста'}</div><span className="edition"><span className="status-dot" />Бесплатно. Без регистрации.</span></header>;
}

function ResultCard({ entry }: { entry: SlangEntry }) {
  return <article className="result-card" id={`word-${entry.id}`}><div className="result-top"><div><span className="category-label">{categoryName(entry)}</span><h3 className="result-word" lang="zh">{entry.term}<span>{entry.pinyin}</span></h3></div><div className="row-actions"><Speak entry={entry} /><Favorite entry={entry} /></div></div><EntryContent entry={entry} /></article>;
}

function HighlightedText({ text, matches }: { text: string; matches: SlangMatch[] }) {
  const { openEntry } = useStore(); let last = 0;
  const parts: ReactNode[] = [];
  matches.forEach((match, i) => { parts.push(text.slice(last, match.start)); parts.push(<button className="matched-word" key={i} onClick={() => openEntry(match.entry)} title={`Открыть ${match.entry.term}`}>{text.slice(match.start, match.end)}</button>); last = match.end; });
  parts.push(text.slice(last));
  return <div className="highlighted-text" lang="zh">{parts}</div>;
}

function Analyzer() {
  const store = useStore();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ text: string; matches: SlangMatch[]; ms: number } | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [ocrError, setOcrError] = useState('');
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [inputMode, setInputMode] = useState<'text' | 'image'>('text');
  const [historyOpen, setHistoryOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null); const textarea = useRef<HTMLTextAreaElement>(null); const resultsRef = useRef<HTMLElement>(null);
  const cancelOcr = useRef<(() => void) | null>(null); const mounted = useRef(true);
  const daily = slangEntries[Math.floor(Date.now() / 86400000) % slangEntries.length];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelOcr.current?.(); }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const analyze = (value = text) => {
    if (!value.trim()) { textarea.current?.focus(); store.notify('Вставь фразу или выбери пример ниже'); return; }
    const normalized = value.normalize('NFKC').slice(0, 10000);
    const start = performance.now(); const matches = findSlang(normalized); const ms = Math.max(1, performance.now() - start);
    setText(normalized); setResult({ text: normalized, matches, ms });
    store.saveHistory(normalized, new Set(matches.map(m => m.entry.id)).size);
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const readImage = async (file?: File) => {
    if (!file || progress) return;
    setOcrError('');
    if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) { setOcrError('Выбери PNG, JPG, WEBP или BMP. Для HEIC сначала сохрани изображение как JPG.'); return; }
    if (file.size > 8 * 1024 * 1024) { setOcrError('Файл больше 8 МБ. Обрежь изображение до нужного текста и загрузи ещё раз.'); return; }
    setPreview(URL.createObjectURL(file)); setInputMode('image'); setProgress({ message: 'Готовим изображение…', percent: 0 });
    const task = recognizeScreenshot(file, p => { if (mounted.current) setProgress(p); });
    cancelOcr.current = task.cancel;
    try {
      const recognized = await task.result;
      if (mounted.current) {
        if (!recognized.trim()) setOcrError('Не удалось найти текст. Попробуй обрезать скриншот или введи фразу вручную.');
        else { setText(recognized.slice(0, 10000)); setResult(null); store.notify('Текст распознан. Проверь его и нажми «Разобрать»'); }
      }
    } catch (e) {
      if (mounted.current && !(e instanceof Error && e.name === 'AbortError')) setOcrError('Не удалось распознать изображение. Проверь подключение к интернету, попробуй другой снимок или введи текст вручную.');
    } finally { if (mounted.current) setProgress(null); cancelOcr.current = null; if (input.current) input.current.value = ''; }
  };
  const unique = result ? [...new Map(result.matches.map(m => [m.entry.id, m.entry])).values()] : [];
  return <div className="page-content home-page"><section className="hero"><div className="hero-copy"><span className="eyebrow"><span />ЖИВОЙ ЯЗЫК. НАСТОЯЩИЙ КОНТЕКСТ.</span><h1>Китайский<br /><span>по ту сторону<br />учебника.</span></h1><p>Что значит <span lang="zh">内卷</span> и почему все пишут YYDS?<br className="desktop-break" />Разберём сленг, поймаем вайб и поможем не попасть в неловкую ситуацию.</p><div className="hero-tags"><span><BookOpen />200 выражений</span><span><ShieldCheck />Без выдуманных значений</span></div></div><div className="hero-art" aria-hidden="true"><img src="/panda-hero.webp" alt="" /><div className="art-word art-word-one"><span lang="zh">绝绝子</span><small>это просто огонь</small><i>↗</i></div><div className="art-word art-word-two"><span>YYDS</span><small>лучшее из лучшего</small><i>✦</i></div><span className="art-caption">懂一点，更有趣。<br /><small>Понимать — интереснее.</small></span></div></section>
    <div className="workspace-grid"><div className="workspace-main"><section className={`analyzer-card ${dragging ? 'drag-over' : ''}`} aria-label="Разбор китайского текста" onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); void readImage(e.dataTransfer.files[0]); }}>
      <div className="editor-top"><div className="segmented" aria-label="Способ ввода"><button aria-pressed={inputMode === 'text'} className={inputMode === 'text' ? 'selected' : ''} onClick={() => setInputMode('text')}><FileText />Текст</button><button aria-pressed={inputMode === 'image'} className={inputMode === 'image' ? 'selected' : ''} onClick={() => setInputMode('image')}><ImagePlus />Скриншот</button></div><span className="editor-note">WEIBO · 小红书 · DOUYIN</span></div>
      {inputMode === 'image' && <div className="upload-area"><input ref={input} id="screenshot-input" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={e => void readImage(e.target.files?.[0])} aria-label="Загрузить скриншот" disabled={!!progress} /><button className="upload-target" onClick={() => input.current?.click()} disabled={!!progress}>{preview ? <img src={preview} alt="Загруженный скриншот" /> : <ImagePlus />}<span><strong>{preview ? 'Загрузить другой скриншот' : 'Перетащи скриншот сюда'}</strong><small>или нажми, чтобы выбрать · до 8 МБ</small></span></button>{progress && <div className="ocr-progress" role="status"><div><LoaderCircle className="spin" />{progress.message}<button className="text-button" onClick={() => cancelOcr.current?.()}>Отмена</button></div><progress value={progress.percent} max={100} aria-label="Прогресс распознавания" /></div>}<p className="upload-tip">Лучше всего работает чёткий снимок с упрощёнными иероглифами. После распознавания текст можно исправить.</p></div>}
      <label className="visually-hidden" htmlFor="analysis-text">Китайский текст для разбора</label><textarea ref={textarea} id="analysis-text" data-testid="input-analysis-text" maxLength={10000} value={text} onChange={e => { setText(e.target.value); setResult(null); }} onPaste={e => { const image = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/')); if (image) { e.preventDefault(); void readImage(image.getAsFile() ?? undefined); } }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); analyze(); } }} placeholder={inputMode === 'image' ? 'Здесь появится текст со скриншота…' : 'Вставь слово, фразу или целый комментарий…\nНапример: 今天又加班了，太内卷了！'} disabled={!!progress} />
      <div className="editor-bottom"><div className="input-meta">{text.length.toLocaleString('ru-RU')} / 10 000{!!text && <button className="text-button" onClick={() => { setText(''); setResult(null); textarea.current?.focus(); }} disabled={!!progress}>Очистить</button>}</div><button className="button button-green analyze-button" onClick={() => analyze()} disabled={!!progress} data-testid="button-analyze"><Sparkles />Разобрать фразу<ArrowRight /></button></div></section>
      {ocrError && <div className="inline-alert" role="alert"><CircleHelp />{ocrError}</div>}<p className="privacy-note"><ShieldCheck />Текст и скриншоты обрабатываются в твоём браузере</p><div className="try-examples"><span>Попробуй:</span>{SAMPLES.map(s => <button key={s.label} onClick={() => analyze(s.text)}>{s.label}<ArrowRight /></button>)}</div>
      {result && <section ref={resultsRef} className="analysis-results" aria-live="polite" aria-label="Результаты разбора" data-testid="section-analysis-results"><div className="section-title"><div><span className="eyebrow">РАЗБОР ГОТОВ</span><h2>{unique.length ? `Поймали вайб ${unique.length === 1 ? 'слова' : 'фразы'}` : 'Пока без совпадений'}</h2></div><span className="time-label"><Clock3 />{(result.ms / 1000).toFixed(2)} с · поиск по базе</span></div><div className="annotated-card"><span className="overline">Твоя фраза · нажми на выделенное слово</span><HighlightedText text={result.text} matches={result.matches} /><div className="annotation-foot">{unique.length} {unique.length === 1 ? 'выражение' : unique.length > 1 && unique.length < 5 ? 'выражения' : 'выражений'} из базы проекта{unique.length > 0 && <button className="text-button" onClick={() => downloadText('PandaSlang-разбор.txt', `${result.text}\n\n${unique.map(entryText).join('\n\n────────\n\n')}`)}><Download />Сохранить разбор</button>}</div></div>{unique.length ? <div className="result-list">{unique.map(entry => <ResultCard entry={entry} key={entry.id} />)}</div> : <div className="empty-state"><span className="empty-symbol" lang="zh">知</span><h3>Не будем придумывать значение</h3><p>В базе из 200 записей не нашлось точного совпадения. Это не значит, что в тексте нет сленга. Проверь распознанный текст или уточни выражение у лингвиста.</p><Link href="/dictionary" className="button button-outline">Посмотреть словарь<ArrowRight /></Link></div>}<p className="context-note">Значения приведены по базе проекта. Сарказм, интонация и контекст всей фразы могут менять смысл.</p></section>}
      <section className="how-strip"><span className="overline">ОТ НЕПОНЯТНОГО К СВОЕМУ</span><div>{[{ n: '01', title: 'Вставь фразу', desc: 'Или загрузи скриншот из соцсети' }, { n: '02', title: 'Узнай смысл', desc: 'Пиньинь, значение и живой пример' }, { n: '03', title: 'Поймай вайб', desc: 'Уместно с друзьями? А на работе?' }].map(s => <article key={s.n}><span>{s.n}</span><h3>{s.title}</h3><p>{s.desc}</p></article>)}</div></section>
    </div><aside className="workspace-aside"><section className="daily-card"><div className="daily-top"><span><span className="status-dot" />СЛОВО ДНЯ</span><Sparkles /></div><span className="daily-word" lang="zh">{daily.term}</span><span className="word-pinyin">{daily.pinyin}</span><p>{daily.meaning}</p><button className="daily-link" onClick={() => store.openEntry(daily)}>Узнать вайб<ArrowRight /></button><span className="daily-watermark" aria-hidden="true">词</span></section><section className="recent-card"><div className="aside-title"><History /><h3>Недавние разборы</h3></div>{store.history.length ? <><div className="recent-list">{store.history.slice(0, historyOpen ? 10 : 3).map(item => <button key={item.date} onClick={() => { setText(item.text); analyze(item.text); }}><span lang="zh">{item.text}</span><small>{dateLabel(item.date)} · {item.count} найдено</small><ArrowRight /></button>)}</div><button className="text-button" onClick={() => setHistoryOpen(v => !v)}>{historyOpen ? 'Свернуть' : 'Показать историю'}</button>{historyOpen && <button className="text-button muted" onClick={store.clearHistory}>Очистить историю</button>}</> : <div className="history-empty"><Clock3 /><p>Твои разборы появятся здесь.<br />Можно вернуться к ним позже.</p></div>}<span className="local-label">Хранится только на этом устройстве</span></section><Link href="/practice" className="practice-promo"><span className="promo-icon"><GraduationCap /></span><div><strong>Запомнить, а не загуглить</strong><p>Закрепи новые слова в практике</p></div><ArrowRight /></Link></aside></div>
  </div>;
}

function Dictionary({ saved = false }: { saved?: boolean }) {
  const store = useStore(); const [query, setQuery] = useState(''); const [category, setCategory] = useState('all'); const [page, setPage] = useState(1);
  const filtered = useMemo(() => searchEntries(query, slangEntries.filter(e => (!saved || store.favorites.includes(e.term)) && (category === 'all' || e.category === category))), [query, category, saved, store.favorites]);
  const pages = Math.ceil(filtered.length / 24); const visible = filtered.slice((page - 1) * 24, page * 24);
  useEffect(() => { setPage(1); }, [query, category, saved, store.favorites]);
  const changePage = (n: number) => { setPage(n); document.getElementById('dictionary-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">{saved ? 'ТВОЯ ЛИЧНАЯ КОЛЛЕКЦИЯ' : 'СЛОВАРЬ ЖИВОГО ЯЗЫКА'}</span><h1>{saved ? <>Забирай <em>себе.</em></> : <>За словами — <em>смыслы.</em></>}</h1><p>{saved ? 'Всё, что хочется запомнить. Возвращайся, повторяй и используй к месту.' : '200 выражений, которые не объясняли на уроках. С пиньинем, примерами и культурным контекстом.'}</p></div><div className="heading-stamp" aria-hidden="true">{saved ? <Star /> : <span lang="zh">词<br />典</span>}</div></div>
    <div className="dictionary-search-row"><div className="search-field"><Search /><label htmlFor="dictionary-search" className="visually-hidden">Найти слово, пиньинь или значение</label><input id="dictionary-search" data-testid="input-dictionary-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Слово, пиньинь или значение…" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X /></button>}<kbd>中 / RU</kbd></div><button className="button button-outline" onClick={() => { const pool = saved ? slangEntries.filter(e => store.favorites.includes(e.term)) : slangEntries; if (pool.length) store.openEntry(pool[Math.floor(Math.random() * pool.length)]); else store.notify('Сначала сохрани хотя бы одно слово'); }}><Shuffle />Случайное слово</button>{saved && store.favorites.length > 0 && <button className="button button-outline" onClick={() => downloadText('PandaSlang-избранное.txt', slangEntries.filter(e => store.favorites.includes(e.term)).map(entryText).join('\n\n────────\n\n'))}><Download />Скачать</button>}</div>
    <div className="category-filters" aria-label="Категории слов"><button className={category === 'all' ? 'active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Все слова<span>{saved ? store.favorites.length : 200}</span></button>{categories.map(c => <button key={c.id} className={category === c.id ? 'active' : ''} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>
    <div className="dictionary-caption" id="dictionary-results"><span data-testid="text-dictionary-count">{query ? 'Найдено' : 'В подборке'} <strong>{filtered.length}</strong> / {saved ? store.favorites.length : 200}</span><span>Открой карточку, чтобы узнать вайб<ArrowDown /></span></div>
    {visible.length ? <div className="dictionary-grid">{visible.map(entry => <article className="dictionary-card" key={entry.id}><div className="dictionary-card-top"><span className="category-label">{categoryName(entry)}</span><Favorite entry={entry} /></div><button className="dictionary-card-body" onClick={() => store.openEntry(entry)} data-testid={`button-dictionary-${entry.id}`}><h2 lang="zh">{entry.term}</h2><span className="word-pinyin">{entry.pinyin}</span><p>{entry.meaning}</p><span className="dictionary-card-foot"><span>{store.learned.includes(entry.term) ? <><CheckCheck />Изучено</> : <>Узнать вайб</>}</span><ArrowRight /></span></button></article>)}</div> : <div className="empty-state"><span className="empty-symbol">{saved ? '☆' : '？'}</span><h2>{saved && !store.favorites.length ? 'Начни свою коллекцию' : 'Пока ничего не нашлось'}</h2><p>{saved && !store.favorites.length ? 'Нажми на звёздочку рядом со словом — оно появится здесь.' : 'Попробуй поиск без тонов: например, neijuan. Или выбери другую категорию.'}</p>{saved && !store.favorites.length ? <Link href="/dictionary" className="button button-green">Открыть словарь<ArrowRight /></Link> : <button className="button button-outline" onClick={() => { setQuery(''); setCategory('all'); }}>Сбросить фильтры</button>}</div>}
    {pages > 1 && <nav className="pagination" aria-label="Страницы словаря"><button className="icon-button" disabled={page === 1} onClick={() => changePage(page - 1)} aria-label="Предыдущая страница"><ChevronLeft /></button>{Array.from({ length: pages }, (_, i) => i + 1).map(n => <button key={n} className={page === n ? 'selected' : ''} aria-label={`Страница ${n}`} aria-current={page === n ? 'page' : undefined} onClick={() => changePage(n)}>{n}</button>)}<button className="icon-button" disabled={page === pages} onClick={() => changePage(page + 1)} aria-label="Следующая страница"><ChevronRight /></button></nav>}
    <div className="dictionary-bottom"><span><ShieldCheck />Значения из базы проекта · 200 записей</span><a href="/data/panda-slang-200.json" download="panda-slang-200.json"><Download />Скачать базу JSON</a></div>
  </div>;
}

function Practice() {
  const store = useStore(); const [source, setSource] = useState('all'); const [session, setSession] = useState<SlangEntry[]>([]); const [index, setIndex] = useState(0); const [flipped, setFlipped] = useState(false); const [correct, setCorrect] = useState(0); const [done, setDone] = useState(false); const [mode, setMode] = useState<'cards' | 'quiz'>('cards'); const [answer, setAnswer] = useState<number | null>(null);
  const entry = session[index];
  const choices = useMemo(() => entry ? shuffled([entry, ...shuffled(slangEntries.filter(e => e.id !== entry.id && e.meaning !== entry.meaning)).slice(0, 3)]) : [], [entry]);
  const pool = source === 'saved' ? slangEntries.filter(e => store.favorites.includes(e.term)) : slangEntries;
  const start = () => { if (!pool.length) { store.notify('Добавь слова в избранное или выбери весь словарь'); return; } setSession(shuffled(pool).slice(0, 10)); setIndex(0); setCorrect(0); setDone(false); setFlipped(false); setAnswer(null); };
  const next = (known: boolean) => { if (known) setCorrect(c => c + 1); if (entry) store.setLearned(entry, known); if (index + 1 >= session.length) setDone(true); else { setIndex(i => i + 1); setFlipped(false); setAnswer(null); } };
  return <div className="page-content practice-page"><div className="page-heading"><div><span className="eyebrow">МАЛЕНЬКИМИ ШАГАМИ К ЖИВОМУ ЯЗЫКУ</span><h1>Осталось <em>запомнить.</em></h1><p>Десять слов за подход. Без оценок и дедлайнов — только ты и новый уровень понимания.</p></div><span className="heading-stamp"><GraduationCap /></span></div><div className="learning-stats"><div><span>В твоём словаре</span><strong>200<small>слов</small></strong></div><div><span>Уже изучено</span><strong>{store.learned.length}<small>слов</small></strong></div><div><span>Сохранено на потом</span><strong>{store.favorites.length}<small>слов</small></strong></div></div>
    {!session.length ? <section className="practice-start"><span className="practice-illustration" lang="zh">学<span>习</span></span><h2>Учить в своём ритме</h2><p>Сначала вспомни значение. Потом переверни карточку или проверь себя в мини-тесте.</p><div className="practice-settings"><fieldset><legend>Как повторять</legend><div className="segmented"><button className={mode === 'cards' ? 'selected' : ''} aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>Карточки</button><button className={mode === 'quiz' ? 'selected' : ''} aria-pressed={mode === 'quiz'} onClick={() => setMode('quiz')}>Мини-тест</button></div></fieldset><fieldset><legend>Какие слова</legend><div className="segmented"><button className={source === 'all' ? 'selected' : ''} aria-pressed={source === 'all'} onClick={() => setSource('all')}>Весь словарь</button><button className={source === 'saved' ? 'selected' : ''} aria-pressed={source === 'saved'} onClick={() => setSource('saved')}>Избранное · {store.favorites.length}</button></div></fieldset></div><button className="button button-green" onClick={start}>Начать · {Math.min(10, pool.length)} слов<ArrowRight /></button><p className="local-label">Прогресс сохраняется на этом устройстве</p></section> : done ? <section className="practice-finish"><span className="finish-mark"><CheckCheck /></span><span className="eyebrow">ЕЩЁ ОДИН ШАГ ВПЕРЁД</span><h2>Вот это <span lang="zh">绝绝子</span>!</h2><p>{mode === 'quiz' ? 'Верных ответов' : 'Вспомнилось'}: <strong>{correct} из {session.length}</strong>. Остальное обязательно запомнится со временем.</p><div className="session-summary">{session.map(e => <button key={e.id} onClick={() => store.openEntry(e)}><span lang="zh">{e.term}</span>{store.learned.includes(e.term) && <Check />}</button>)}</div><div className="button-row"><button className="button button-green" onClick={start}><RotateCcw />Ещё 10 слов</button><button className="button button-outline" onClick={() => setSession([])}>Выбрать режим</button></div></section> : <section className="practice-session"><div className="session-top"><button className="text-button" onClick={() => { setSession([]); setAnswer(null); }}><ArrowLeft />К настройкам</button><span>{index + 1} / {session.length}</span><Favorite entry={entry} /></div><progress className="session-progress" value={index} max={session.length} aria-label="Прогресс занятия" /><div className="flashcard" key={entry.id}><span className="category-label">{categoryName(entry)}</span><h2 lang="zh">{entry.term}</h2><span className="word-pinyin">{entry.pinyin}</span><Speak entry={entry} />{mode === 'cards' ? flipped ? <div className="flashcard-answer"><p>{entry.meaning}</p><VibeCheck entry={entry} /><span className="flashcard-example" lang="zh">{entry.exampleZh}</span><small>{entry.exampleRu}</small></div> : <div className="flashcard-prompt"><p>Как бы ты объяснил это другу?</p><button className="button button-outline" onClick={() => setFlipped(true)}>Показать значение<RotateCcw /></button></div> : <div className="quiz-choices" aria-label="Варианты значения">{choices.map((choice, i) => <button key={choice.id} disabled={answer !== null} className={answer !== null ? choice.id === entry.id ? 'correct' : choice.id === answer ? 'wrong' : '' : ''} onClick={() => setAnswer(choice.id)}><span>{i + 1}</span>{choice.meaning}{answer !== null && choice.id === entry.id && <Check />}</button>)}</div>}</div>{mode === 'cards' && flipped && <div className="flashcard-controls"><button className="button button-outline" onClick={() => next(false)}><RotateCcw />Ещё повторю</button><button className="button button-green" onClick={() => next(true)}><Check />Запомнилось</button></div>}{mode === 'quiz' && answer !== null && <div className="quiz-feedback" role="status"><span>{answer === entry.id ? 'Точно! Вайб пойман.' : 'Теперь знаешь. Правильный ответ выделен зелёным.'}</span><button className="button button-green" onClick={() => next(answer === entry.id)}>Дальше<ArrowRight /></button></div>}</section>}
  </div>;
}

export default function App() {
  const [favorites, setFavorites, favoriteError] = usePersistent('panda-slang:favorites', [] as string[], isStringList);
  const [learned, setLearned, learnedError] = usePersistent('panda-slang:learned', [] as string[], isStringList);
  const [history, setHistory, historyError] = usePersistent('panda-slang:history', [] as HistoryItem[], isHistory);
  const [selected, setSelected] = useState<SlangEntry | null>(null); const [notice, setNotice] = useState(''); const [path] = useLocation();
  const realFavorites = useMemo(() => [...new Set(favorites.filter(term => validTerms.has(term)))], [favorites]);
  const realLearned = useMemo(() => [...new Set(learned.filter(term => validTerms.has(term)))], [learned]);
  useEffect(() => { if ('speechSynthesis' in window) window.speechSynthesis.getVoices(); }, []);
  useEffect(() => { document.title = `${path === '/dictionary' ? 'Словарь' : path === '/saved' ? 'Избранное' : path === '/practice' ? 'Практика' : 'Китайский по ту сторону учебника'} · Panda Slang`; window.scrollTo({ top: 0 }); }, [path]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4200); return () => window.clearTimeout(timer); }, [notice]);
  const store: Store = { favorites: realFavorites, learned: realLearned, history, openEntry: setSelected, notify: setNotice, toggleFavorite: entry => { const exists = favorites.includes(entry.term); setFavorites(list => exists ? list.filter(t => t !== entry.term) : [...list, entry.term]); setNotice(exists ? 'Убрано из избранного' : 'Слово в твоей коллекции'); }, setLearned: (entry, yes) => setLearned(list => yes ? [...new Set([...list, entry.term])] : list.filter(t => t !== entry.term)), saveHistory: (text, count) => setHistory(list => [{ text, count, date: Date.now() }, ...list.filter(item => item.text !== text)].slice(0, 20)), clearHistory: () => setHistory([]) };
  return <StoreContext.Provider value={store}><a className="skip-link" href="#main-content">К содержимому</a><div className="app-shell"><Sidebar /><div className="main-area"><Header /><main id="main-content" tabIndex={-1}><ErrorBoundary resetKey={path}><Switch><Route path="/" component={Analyzer} /><Route path="/dictionary"><Dictionary key="dictionary" /></Route><Route path="/saved"><Dictionary saved key="saved" /></Route><Route path="/practice" component={Practice} /><Route><div className="page-content empty-state"><h1>Здесь ещё нет слов</h1><p>Такой страницы не существует.</p><Link href="/" className="button button-green">Вернуться к разбору<ArrowRight /></Link></div></Route></Switch></ErrorBoundary></main><footer className="site-footer"><span>Panda Slang<span className="brand-dot">.</span><small>Понимай язык. Чувствуй контекст.</small></span></footer></div></div><EntryModal entry={selected} onClose={() => setSelected(null)} />{notice && <div className="toast" role="status"><Check />{notice}<button aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X /></button></div>}{(favoriteError || learnedError || historyError) && <div className="storage-warning" role="alert">Браузер не разрешает сохранять данные. Избранное и прогресс могут исчезнуть после обновления страницы.</div>}</StoreContext.Provider>;
}
