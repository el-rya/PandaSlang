import sourceEntries from "./data/slang.json";
export type SlangEntry = { id: number; term: string; pinyin: string; literalTranslation: string; meaning: string; goodContext: string; badContext: string; exampleZh: string; exampleRu: string; category: string };
export const slangEntries: SlangEntry[] = sourceEntries;
export const categories = [
  {
    "id": "abbr",
    "name": "Буквы и цифры",
    "description": "YYDS, xswl и язык чатов"
  },
  {
    "id": "feelings",
    "name": "Эмоции",
    "description": "Когда сложно подобрать слова"
  },
  {
    "id": "reactions",
    "name": "Реакции",
    "description": "От восторга до сарказма"
  },
  {
    "id": "work",
    "name": "Работа и учёба",
    "description": "Дедлайны, пары и выгорание"
  },
  {
    "id": "life",
    "name": "Люди и жизнь",
    "description": "Характеры, привычки и общение"
  },
  {
    "id": "shopping",
    "name": "Покупки",
    "description": "Находки, скидки и пустой кошелёк"
  },
  {
    "id": "fandom",
    "name": "Любовь и фандомы",
    "description": "Симпатии, айдолы и шиппинг"
  },
  {
    "id": "social",
    "name": "Соцсети",
    "description": "Комментарии и интернет-культура"
  },
  {
    "id": "games",
    "name": "Игры и мемы",
    "description": "Катки, стримы и абсурд"
  },
  {
    "id": "trends",
    "name": "Тренды",
    "description": "От citywalk до стиля жизни"
  }
];
