# Scacchi 3D

Scacchi su un cubo 8×8×8 (512 celle), giocabili nel browser. Si gioca in due sullo stesso dispositivo o contro il computer.

**Gioca online:** https://rabax1972.github.io/3dChess/

Stack: TypeScript, Vite, Three.js (con OrbitControls) e Vitest.

## Avvio

```bash
npm install
npm run dev        # server di sviluppo su http://localhost:5173
npm test           # test unitari, perft e IA (Vitest)
npm run build      # type-check e build di produzione in dist/
npm run preview    # serve la build di produzione
```

Serve Node 18 o successivo.

## Regole 3D

### Coordinate e notazione

- **x = colonna** (a–h), **y = traversa** (1–8), **z = livello** (1–8).
- Una casella si scrive `colonna traversa . livello`: `c2.3` è la colonna c, traversa 2, livello 3.
- Una mossa si scrive `<pezzo><partenza> -> <arrivo>`. Per le catture si usa `x`, per la promozione `=X`, per lo scacco `+` e per il matto `#`. Esempi: `Cb1.2 -> c3.2`, `Dd4.5 x f6.7+`, `b7.1 -> b8.1=D`, `Re1.1 -> g1.1 (O-O)`.
- Le lettere dei pezzi sono quelle italiane: **R** Re, **D** Donna (regina), **T** Torre, **A** Alfiere, **C** Cavallo. Il pedone non ha lettera.

### Schieramento iniziale

Quello di default ([src/engine/setup.ts](src/engine/setup.ts)) è **classico sul livello 1**: 16 pezzi per parte, tutti sul livello più basso del cubo, come su una scacchiera normale. Il Bianco ha i pezzi sulla traversa 1 e i pedoni sulla traversa 2, il Nero i pezzi sulla traversa 8 e i pedoni sulla traversa 7. Da lì i pezzi possono salire negli altri livelli.

Dalla finestra *Nuova partita* si possono scegliere anche:

- **Bianco in basso, Nero in alto**: Bianco sul livello 1, Nero sul livello 8;
- **Nero in basso, Bianco in alto**: Nero sul livello 1, Bianco sul livello 8;
- **Doppio set**: due set completi per parte (32 pezzi), Bianco sui livelli 1-2, Nero sui livelli 7-8.

In tutti gli schieramenti i pedoni avanzano lungo l'asse y, cioè verso la traversa avversaria, indipendentemente dal livello.

### Movimento dei pezzi

| Pezzo | Movimento | Direzioni |
|---|---|---|
| Torre | scorre lungo uno dei 3 assi | 6 |
| Alfiere | scorre lungo le diagonali che cambiano **esattamente due** coordinate dello stesso valore (piani x/y, x/z, y/z) | 12 |
| Regina | torre + alfiere + diagonali che cambiano **tutte e tre** le coordinate | 26 |
| Re | una casella in una qualsiasi direzione adiacente | 26 |
| Cavallo | salto (±2, ±1, 0) in ogni permutazione degli assi; ignora i pezzi in mezzo | 24 |
| Pedone | avanza lungo y verso la traversa avversaria; cattura in diagonale in avanti: y+1 combinato con x±1 oppure z±1 | 1 (+1) / 4 catture |

Nessun pezzo, tranne il cavallo, può attraversare altri pezzi. I pezzi che scorrono si fermano davanti al primo pezzo e possono catturarlo se è avversario.

L'alfiere conserva la parità di x+y+z, perché cambia sempre due coordinate di ±1. Come in 2D, resta quindi sempre sullo stesso "colore" di cella.

### Regole speciali (scelte di design)

- **Doppio passo del pedone.** Alla *prima mossa* del pedone, se le due caselle davanti sono libere. "Prima mossa" è tracciata con un flag per pezzo ("mai mosso"), non con la traversa di partenza, così funziona con qualsiasi schieramento.
- **En passant.** Dopo un doppio passo, la casella scavalcata diventa catturabile per una sola mossa. La cattura è possibile da qualsiasi pedone avversario che, con una delle sue 4 catture diagonali (x±1 oppure z±1), raggiunge quella casella. Il pedone catturato viene rimosso dalla casella in cui si trova. È la generalizzazione più diretta della regola classica: un pedone che passa "accanto" a un pedone nemico, sull'asse x o sull'asse z, può essere preso al varco.
- **Arrocco.** Avviene sul piano del re: stesso livello, stessa traversa, lungo l'asse x, esattamente come in 2D. Re e torre non devono essersi mai mossi, le caselle tra loro devono essere libere, e il re non deve essere sotto scacco né attraversare o raggiungere caselle attaccate. Gli attacchi contano da qualsiasi direzione 3D, anche da altri livelli. Il re si sposta di due caselle verso la torre e la torre scavalca il re (`O-O` verso h, `O-O-O` verso a). Non esiste arrocco tra livelli diversi.
- **Promozione.** Sull'ultima traversa (8 per il Bianco, 1 per il Nero), su qualsiasi livello. Si sceglie tra regina, torre, alfiere e cavallo.
- **Più re per giocatore.** Nello schieramento *Doppio set* ogni giocatore ha due re, e **sono entrambi pezzi reali**. Una mossa è legale solo se non lascia *nessuno* dei propri re sotto scacco. È scacco quando almeno un re è attaccato, ed è scacco matto quando si è sotto scacco e non esiste una mossa legale. È la scelta più fedele alla regola "non si può lasciare il re sotto scacco". Rende anche possibili le forchette ai due re.

### Fine della partita

- Scacco matto e stallo.
- **Patta** in tre casi:
  - **ripetizione tripla**: stessa posizione con stesso giocatore al tratto, stessi diritti d'arrocco e stessa casella en passant, riconosciuta con hash Zobrist;
  - **regola delle 50 mosse**: 100 semimosse senza catture né mosse di pedone;
  - **materiale insufficiente**: niente pedoni, torri o regine, e al massimo un pezzo minore in tutto, oppure solo alfieri tutti sullo stesso colore di cella. È una scelta prudente: in 3D il re ha 26 vie di fuga, quindi nessun materiale "minore" è in grado di forzare il matto.

## Interfaccia

- **Camera**: si trascina per ruotare, rotella o pizzico per lo zoom, tasto destro o due dita per spostare. *Centra la vista* reinquadra il cubo; *Ruota lato* passa al punto di vista dell'altro giocatore.
- **Selezione**: click su un pezzo del giocatore di turno. Le mosse libere sono in verde (sfera e cella), le catture in rosso (anello e cella). Il re sotto scacco è rosso e pulsa. L'ultima mossa è in blu.
- **Mossa**: click su una cella o su un marcatore evidenziato. La mossa è animata.
- **Filtro livelli**: *Tutti*, *Uno* o *Intervallo*. I livelli non selezionati si possono attenuare o nascondere, e solo i pezzi dei livelli attivi sono cliccabili. La barra verticale a destra della scena seleziona un livello con un click; un secondo click torna a *Tutti*. Un punto verde (o rosso, per le catture) segnala i livelli in cui il pezzo selezionato ha mosse.
- **Coordinate e assi**: le coordinate sulle celle e gli indicatori degli assi si accendono e spengono dal pannello *Vista*.
- **Scorciatoie**: `Ctrl+Z` annulla, `Ctrl+Y` ripete, `Esc` deseleziona, `↑`/`↓` spostano il livello selezionato.
- Il pannello mostra la lista delle mosse, i pezzi catturati e il vantaggio materiale. *Nuova partita* permette di scegliere modalità, colore, difficoltà e schieramento.
- Il layout è responsive: sotto gli 860 px il pannello va sotto la scena e si può chiudere con ☰.

## Intelligenza artificiale

[src/engine/ai/](src/engine/ai/) contiene il codice puro dell'IA, eseguito in un **Web Worker** ([src/worker/ai.worker.ts](src/worker/ai.worker.ts)) per non bloccare l'interfaccia. Annulla e Nuova partita interrompono subito la ricerca terminando il worker.

- **Ricerca**: minimax in forma negamax con potatura alfa-beta. In più ci sono:
  - approfondimento iterativo con limite di tempo;
  - PVS (finestra nulla);
  - tabella di trasposizione;
  - ricerca di quiescenza sulle catture;
  - ordinamento delle mosse (mossa della TT, MVV-LVA, killer move).
- **Valutazione**: materiale + mobilità (caselle raggiungibili da cavalli, alfieri, torri, regine e re) + controllo del centro del cubo (bonus proporzionale alla vicinanza alla cella centrale) + un piccolo bonus per l'avanzamento dei pedoni. In 3D i pezzi a lungo raggio pesano di più: regina 1150, torre 520, alfiere 360, cavallo 330, pedone 100.
- **Difficoltà**:

  | Livello | Profondità | Tempo massimo | Note |
  |---|---|---|---|
  | Facile | 1 | 1,5 s | un po' di casualità nella scelta |
  | Medio | 2 | 4 s | |
  | Difficile | 4 | 9 s | di solito arriva a profondità 4 |

## Architettura

```
src/
  engine/            motore delle regole, puro (niente DOM né Three.js)
    types.ts         costanti, coordinate, tipi dei pezzi
    move.ts          codifica delle mosse in un intero (da, a, promozione, flag)
    directions.ts    tabelle precalcolate: 26 direzioni, raggi, salti, catture dei pedoni
    position.ts      scacchiera, make/unmake, generatore di mosse, scacco, patte
    zobrist.ts       hash delle posizioni
    setup.ts         schieramenti iniziali (configurabili)
    notation.ts      notazione a tre componenti (scrittura e lettura)
    game.ts          partita: mosse giocate, annulla/ripeti
    ai/              valutazione e ricerca alfa-beta
  render/            Three.js: scena, celle, pezzi procedurali, marcatori, animazioni
  ui/                controller dell'app, pannelli, filtro livelli, client dell'IA
  worker/            Web Worker dell'IA
tests/               Vitest: pezzi, regole, perft, generatore di riferimento, IA, filtro livelli
```

### Modello dati

- La scacchiera è un `Int8Array(512)`, con indice `x + 8·y + 64·z` e valore `colore × tipo` (0 = vuota).
- Un `Uint8Array` "mai mosso" serve ad arrocco e doppio passo.
- I re di ogni colore e la lista delle caselle occupate sono aggiornati in modo incrementale, così generatore e valutazione non scorrono tutte le 512 celle.
- Le mosse sono interi a 23 bit e make/unmake è incrementale, hash compreso: la ricerca non alloca scacchiere.
- La generazione è pseudo-legale con filtro di legalità (gioca la mossa e controlla che nessun re proprio sia attaccato). Il test di attacco parte dalla casella del re e risale raggi, salti e catture dei pedoni.

Prestazioni: circa 500 000 nodi/s in perft su Node. Le mosse legali dello schieramento iniziale si generano in meno di 0,3 ms.

### Cambiare lo schieramento

Ogni schieramento è una `SetupDefinition` in [src/engine/setup.ts](src/engine/setup.ts) che specifica:

- l'ordine dei pezzi sulla traversa di fondo;
- i livelli occupati da ciascun colore;
- le traverse dei pezzi e dei pedoni.

Per pezzi aggiuntivi c'è un array `extra`. Basta aggiungere la definizione a `SETUPS` perché compaia nella finestra *Nuova partita*. Il resto del codice non contiene coordinate fisse.

## Test

`npm test` esegue 70+ test:

- **Pezzi** ([tests/pieces.test.ts](tests/pieces.test.ts)): per ogni pezzo movimento libero (conteggi dal centro e dagli angoli), blocco da pezzi amici e cattura del primo avversario. Copre anche le catture dei pedoni su x e z e la promozione.
- **Regole** ([tests/rules.test.ts](tests/rules.test.ts)):
  - en passant su x e su z e la sua scadenza;
  - arrocco corto e lungo con tutti i divieti, incluso l'attacco da un altro livello;
  - scacco, inchiodatura, matto e stallo;
  - due re;
  - le tre patte;
  - notazione e annulla/ripeti.
- **Perft** ([tests/perft.test.ts](tests/perft.test.ts)): numero di mosse generate dallo schieramento iniziale.

  | Schieramento | perft(1) | perft(2) | perft(3) |
  |---|---|---|---|
  | Classico sul livello 1 (default) | 106 | 11 222 | 1 340 848 |
  | Bianco in basso / Nero in basso | 104 | 10 246 | |
  | Doppio set | 130 | 16 633 | 2 377 864 |

  perft(1) è ricavato a mano. Con Bianco in basso e Nero in alto il Bianco ha:
  - pedoni: 8 × 2 = 16;
  - cavalli: 7 + 7 = 14;
  - torri: 7 + 7, verso l'alto, totale 14;
  - alfieri: 14 + 14 = 28, inclusa la cattura dell'alfiere nero sulla diagonale y/z;
  - regina: 28;
  - re: 4, perché due delle sei caselle sul livello 2 sono attaccate da regina e alfiere neri del livello 8;
  - totale 104.

  Nel classico sul livello 1 quelle due caselle sono libere, quindi 104 + 2 = 106. Per il doppio set:
  - pedoni: 16 × 2 = 32;
  - cavalli: 6 + 6 sul livello 1, 8 + 8 sul livello 2, totale 28;
  - torri: 6 + 6, solo verso l'alto dal livello 2, totale 12;
  - alfieri: 13 + 13 dal livello 2, totale 26;
  - regina del livello 2: 26;
  - re del livello 2: 6 caselle sul livello 3;
  - totale 130. I pezzi del livello 1 sono tutti bloccati.

  I valori più profondi sono confermati da un **generatore di riferimento indipendente** ([tests/reference.ts](tests/reference.ts)), scritto in modo volutamente ingenuo. Lo stesso generatore viene confrontato mossa per mossa con quello veloce lungo partite pseudo-casuali su tutti gli schieramenti. Un ultimo controllo verifica che make/unmake ripristini scacchiera, diritti e hash.
- **IA** ([tests/ai.test.ts](tests/ai.test.ts)): matto in una, cattura di un pezzo indifeso, rifiuto di uno scambio perdente, rispetto del limite di tempo e posizione intatta dopo la ricerca.
- **Filtro livelli** ([tests/levelFilter.test.ts](tests/levelFilter.test.ts)).
