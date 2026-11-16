import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { BASICS, IDEAS, plainText, searchLearn, SENSORS, type Block, type GlossaryWord, type Inline, type Learn as LearnData, type LearnPage, type Listed, type Section } from '@lib/learn';
import { Icon, TextField } from '../ui';
import { BreadboardIcon, PartIcon } from '../workspace/drawings';
import { LEARN } from './content';
import { FIGURES } from './figures';
import './learn.css';

/**
 * Learn (M8, screens 30, 30b, 30c; F-40, F-42, F-44): the pages about the parts, for students of 10–13 — home with
 * the parts by group and the big ideas, a part's page from library/learn with its picture to play with, the
 * glossary, and a search for any of them. A page that is not written yet is listed, quieter, as "soon".
 */
export const LEARN_HOME = 'home';
export const LEARN_GLOSSARY = 'glossary';

export interface LearnProps {
  /** The page shown: a page's id, 'home' or 'glossary'. */
  at: string;
  onAt: (id: string) => void;
  /** Learn's pages; the app's own unless a test gives others. */
  learn?: LearnData;
}

/** A part's small picture: the parts panel's own. */
function Art({ part }: { part: string }) {
  return part === 'breadboard' ? <BreadboardIcon size="half" /> : <PartIcon type={part} />;
}

// ------------------------------------------------------------------ a page's words
interface Words {
  /** A glossary word clicked: its lines open beside it. */
  onWord: (word: string, from: HTMLElement) => void;
  open: string | null;
  onPage: (id: string) => void;
  glossary: LearnData['glossary'];
}

function Text({ kids, words }: { kids: Inline[]; words: Words }): ReactNode {
  return kids.map((k, i) => {
    switch (k.t) {
      case 'text': return <Fragment key={i}>{k.text}</Fragment>;
      case 'b': return <b key={i}><Text kids={k.kids} words={words} /></b>;
      case 'i': return <i key={i}><Text kids={k.kids} words={words} /></i>;
      case 'word': return (
        <button key={i} type="button" className="word" aria-expanded={words.open === k.word} title={`What “${k.word}” means`}
          onClick={(e) => words.onWord(k.word, e.currentTarget)}>{k.text}</button>
      );
      case 'link': return <button key={i} type="button" className="plink" onClick={() => words.onPage(k.page)}><Text kids={k.kids} words={words} /></button>;
    }
  });
}

function BlockView({ block, idea, words }: { block: Block; idea: boolean; words: Words }) {
  switch (block.t) {
    case 'p':
      if (idea) return <div className="idea"><Icon name="bulb" size={16} /><span><Text kids={block.kids} words={words} /></span></div>;
      return <p className={block.small ? 'small muted' : undefined}><Text kids={block.kids} words={words} /></p>;
    case 'figure': {
      const Figure = FIGURES[block.name];
      return Figure ? <div className="play"><Figure /></div> : null;
    }
    case 'table':
      return (
        <table className="spec">
          <tbody>
            {block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}><Text kids={cell} words={words} /></td>)}</tr>)}
          </tbody>
        </table>
      );
    case 'calc':
      return <div className="calc">{block.cells.map((c) => <div key={c.label}>{c.label}<b>{c.value}</b></div>)}</div>;
    case 'mistakes':
      return (
        <div className="mistakes">
          {block.items.map((m) => (
            <div key={m.title} className="mistake">
              <span className={m.bad ? 'mi bad' : 'mi'}><Icon name={m.bad ? 'alert' : 'warn'} /></span>
              <div><b>{m.title}</b><span><Text kids={m.kids} words={words} /></span></div>
            </div>
          ))}
        </div>
      );
    case 'words':
      return (
        <dl className="lwords">
          {block.words.map((w) => {
            const entry = words.glossary[w];
            return entry ? <div key={w}><dt>{entry.word}</dt><dd><Text kids={entry.kids} words={words} /></dd></div> : null;
          })}
        </dl>
      );
    case 'code': return null;
  }
}

/** A page's own glossary (screen 30d) is beside its sections, not one of them: it has no number. */
const numbered = (section: Section) => section.title !== 'Glossary';

function SectionCard({ section, n, words }: { section: Section; n: number; words: Words }) {
  // the idea itself stands in its own box (screens 30b, 30c, 30d): the section's first paragraph
  const ideaAt = section.title === 'The idea' || section.title === 'The rule' ? section.blocks.findIndex((b) => b.t === 'p') : -1;
  return (
    <section className="card lsec" aria-label={section.title}>
      <h2>{numbered(section) ? <span className="num" aria-hidden="true">{n}</span> : <Icon name="list" size={16} />}{section.title}</h2>
      {section.blocks.map((b, i) => <BlockView key={i} block={b} idea={i === ideaAt} words={words} />)}
    </section>
  );
}

function PageView({ page, words }: { page: LearnPage; words: Words }) {
  const left = page.sections.slice(0, page.left);
  const right = page.sections.slice(page.left);
  const numbers = page.sections.filter(numbered);
  const numberOf = (s: Section) => numbers.indexOf(s) + 1;
  return (
    <>
      <div className="lcol wide">
        <div className="card lhero">
          {page.part && <div className="hart"><Art part={page.part} /></div>}
          <div className="col">
            <span className="tag">{page.tag}</span>
            <h1>{page.title}</h1>
            <p className="lede"><Text kids={page.lede} words={words} /></p>
            {page.uses.length > 0 && <div className="uses" aria-label="Where you meet it">{page.uses.map((u) => <span key={u}>{u}</span>)}</div>}
          </div>
        </div>
        {left.map((s) => <SectionCard key={s.title} section={s} n={numberOf(s)} words={words} />)}
      </div>
      {right.length > 0 && (
        <div className="lcol">
          {right.map((s) => <SectionCard key={s.title} section={s} n={numberOf(s)} words={words} />)}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ home, the glossary, what a search found
function PartCard({ item, page, onAt }: { item: Listed; page: LearnPage | undefined; onAt: (id: string) => void }) {
  const inside = <><span className="art"><Art part={item.id} /></span><b>{item.title}</b><span>{page?.card ?? item.card}</span></>;
  return page
    ? <button type="button" className="card lcard" onClick={() => onAt(item.id)}>{inside}</button>
    : <div className="card lcard soon" aria-label={`${item.title}: its page comes soon`}>{inside}<span className="pill">soon</span></div>;
}

function Home({ learn, onAt }: { learn: LearnData; onAt: (id: string) => void }) {
  return (
    <>
      <div>
        <h1>How electronics works</h1>
        <p className="intro">Every part has a page: what it is, a look inside to play with, the idea behind it, its numbers, and how to connect it. Start with the Basics — the parts in almost every circuit.</p>
      </div>
      <section aria-label="Basics">
        <div className="row lhead"><h2>Basics</h2><span className="tiny muted">{BASICS.length} parts</span></div>
        <div className="lgrid">{BASICS.map((b) => <PartCard key={b.id} item={b} page={learn.pages[b.id]} onAt={onAt} />)}</div>
      </section>
      <section aria-label="Big ideas">
        <div className="row lhead"><h2>Big ideas</h2><span className="tiny muted">what every part page leans on</span></div>
        <div className="ideas">
          {IDEAS.map((idea) => {
            const inside = <><span className="ib"><Icon name={idea.icon} size={18} /></span><span><b>{idea.title}</b><span>{idea.card}</span></span></>;
            return learn.pages[idea.id]
              ? <button key={idea.id} type="button" className="card ideacard" onClick={() => onAt(idea.id)}>{inside}</button>
              : <div key={idea.id} className="card ideacard soon" aria-label={`${idea.title}: its page comes soon`}>{inside}<span className="pill">soon</span></div>;
          })}
        </div>
      </section>
      <section aria-label="Sensors">
        <div className="row lhead"><h2>Sensors</h2><span className="tiny muted">{SENSORS.length} parts</span></div>
        <div className="lgrid">{SENSORS.map((s) => <PartCard key={s.id} item={s} page={learn.pages[s.id]} onAt={onAt} />)}</div>
      </section>
      <section aria-label="More parts">
        <div className="row lhead"><h2>More parts</h2><span className="tiny muted">their pages come group by group</span></div>
        <div className="row pills">
          {['Modules', 'Actuators', 'Displays', 'Chips', 'Communication', 'Boards'].map((g) => <span key={g} className="pill">{g}</span>)}
        </div>
      </section>
    </>
  );
}

function WordCard({ entry, words }: { entry: GlossaryWord; words: Words }) {
  return <div className="card gword"><dt>{entry.word}</dt><dd><Text kids={entry.kids} words={words} /></dd></div>;
}

function Glossary({ learn, words }: { learn: LearnData; words: Words }) {
  const entries = Object.values(learn.glossary).sort((a, b) => a.word.localeCompare(b.word));
  return (
    <>
      <div>
        <h1>Glossary</h1>
        <p className="intro">The words of electronics, a line or two each. In a page, a word with a dotted line under it opens its lines here.</p>
      </div>
      <dl className="gwords">{entries.map((e) => <WordCard key={e.word} entry={e} words={words} />)}</dl>
    </>
  );
}

function Found({ learn, query, onAt, words }: { learn: LearnData; query: string; onAt: (id: string) => void; words: Words }) {
  const found = searchLearn(learn, query);
  const soon = [...BASICS, ...SENSORS, ...IDEAS].filter((l) => !learn.pages[l.id] && l.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <div>
        <h1>Search</h1>
        <p className="intro" role="status">
          {found.pages.length + found.words.length === 0 ? <>Nothing in Learn matches “{query}”.</>
            : <>{found.pages.length} {found.pages.length === 1 ? 'page' : 'pages'} and {found.words.length} {found.words.length === 1 ? 'word' : 'words'} for “{query}”.</>}
          {soon.length > 0 && <> Coming soon: {soon.map((s) => s.title).join(', ')}.</>}
        </p>
      </div>
      {found.pages.length > 0 && (
        <section aria-label="Pages found">
          <div className="lgrid">
            {found.pages.map((p) => (
              <button key={p.id} type="button" className="card lcard" onClick={() => onAt(p.id)}>
                <span className="art">{p.part ? <Art part={p.part} /> : <Icon name="bulb" size={24} />}</span><b>{p.title}</b><span>{p.card}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {found.words.length > 0 && <dl className="gwords" aria-label="Words found">{found.words.map((e) => <WordCard key={e.word} entry={e} words={words} />)}</dl>}
    </>
  );
}

// ------------------------------------------------------------------ the list at the left
function NavItem({ id, at, onAt, live, sub, children }: { id: string; at: string; onAt: (id: string) => void; live: boolean; sub?: boolean; children: ReactNode }) {
  const cls = [sub && 'sub', at === id && 'on', !live && 'later'].filter(Boolean).join(' ');
  return live
    ? <button type="button" className={cls} aria-current={at === id ? 'page' : undefined} onClick={() => onAt(id)}>{children}</button>
    : <span className={cls}>{children}<span className="spacer" /><span className="tiny">soon</span></span>;
}

export function Learn({ at, onAt, learn = LEARN }: LearnProps) {
  const [query, setQuery] = useState('');
  const [word, setWord] = useState<{ word: string; left: number; top: number } | null>(null);
  const main = useRef<HTMLElement>(null);
  const page = learn.pages[at];
  const searching = query.trim().length > 0;

  const go = (id: string) => {
    setQuery('');
    setWord(null);
    onAt(id);
  };

  // a new page starts at its top, with no word open
  useEffect(() => {
    setWord(null);
    main.current?.scrollTo?.(0, 0);
  }, [at]);

  // the open word closes with Esc, or a click anywhere else
  useEffect(() => {
    if (!word) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setWord(null); };
    const click = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest?.('.word, .gloss')) setWord(null); };
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('mousedown', click);
    };
  }, [word]);

  const words: Words = {
    open: word?.word ?? null,
    glossary: learn.glossary,
    onPage: go,
    onWord: (w, from) => {
      if (word?.word === w) { setWord(null); return; }
      // under the word, kept inside the page
      const box = main.current!.getBoundingClientRect();
      const r = from.getBoundingClientRect();
      const left = Math.max(12, Math.min(r.left - box.left + main.current!.scrollLeft, box.width - 290));
      setWord({ word: w, left, top: r.bottom - box.top + main.current!.scrollTop + 8 });
    },
  };

  const entry = word ? learn.glossary[word.word] : undefined;
  const flow = searching || !page;

  return (
    <div className="learn">
      <nav className="lnav" aria-label="Learn">
        <TextField label="Search Learn" hideLabel icon="search" clearable value={query} onChange={setQuery} placeholder="Search: LED, resistor, current…" />
        <NavItem id={LEARN_HOME} at={searching ? '' : at} onAt={go} live><Icon name="home" size={14} /> Learn home</NavItem>
        <div className="gh">Parts</div>
        <div className="group" role="group" aria-label="Basics">
          <span className="glabel"><Icon name="chevd" size={12} /> Basics <span className="spacer" /><span className="tiny muted">{BASICS.length}</span></span>
          {BASICS.map((b) => (
            <NavItem key={b.id} id={b.id} at={searching ? '' : at} onAt={go} live={!!learn.pages[b.id]} sub><span className="bdot"><Art part={b.id} /></span>{b.title}</NavItem>
          ))}
        </div>
        <div className="group" role="group" aria-label="Sensors">
          <span className="glabel"><Icon name="chevd" size={12} /> Sensors <span className="spacer" /><span className="tiny muted">{SENSORS.length}</span></span>
          {SENSORS.map((s) => (
            <NavItem key={s.id} id={s.id} at={searching ? '' : at} onAt={go} live={!!learn.pages[s.id]} sub><span className="bdot"><Art part={s.id} /></span>{s.title}</NavItem>
          ))}
        </div>
        <span className="later"><Icon name="chevr" size={12} /> Modules, chips, actuators…<span className="spacer" /><span className="tiny">later</span></span>
        <div className="gh">Ideas</div>
        {IDEAS.map((idea) => (
          <NavItem key={idea.id} id={idea.id} at={searching ? '' : at} onAt={go} live={!!learn.pages[idea.id]}><Icon name={idea.icon} size={14} /> {idea.title}</NavItem>
        ))}
        <div className="gh">Words</div>
        <NavItem id={LEARN_GLOSSARY} at={searching ? '' : at} onAt={go} live><Icon name="list" size={14} /> Glossary</NavItem>
      </nav>
      <main ref={main} className={flow ? 'lmain flow' : 'lmain'} aria-label={searching ? 'Search' : page ? page.title : at === LEARN_GLOSSARY ? 'Glossary' : 'Learn home'}>
        {searching ? <Found learn={learn} query={query} onAt={go} words={words} />
          : page ? <PageView page={page} words={words} />
          : at === LEARN_GLOSSARY ? <Glossary learn={learn} words={words} />
          : <Home learn={learn} onAt={go} />}
        {entry && word && (
          <div className="card gloss" role="note" aria-label={`${entry.word}: what it means`} style={{ left: word.left, top: word.top }}>
            <b>{entry.word}</b><span>{plainText(entry.kids)}</span>
          </div>
        )}
      </main>
    </div>
  );
}
