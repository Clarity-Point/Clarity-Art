const practices = [
  {
    id: 'two-lines',
    title: 'Две линии',
    minutes: 3,
    material: 'pencil',
    supplies: 'Бумага и карандаш или холст',
    steps: [
      'Проведите одну линию быстрым движением, а другую — медленно.',
      'Посмотрите на обе линии. Если хочется, продолжите одну из них.',
    ],
    prompt: 'Какую линию хочется продолжить?',
  },
  {
    id: 'three-shapes',
    title: 'Три формы',
    minutes: 5,
    material: 'pencil',
    supplies: 'Бумага и карандаш или холст',
    steps: [
      'Разместите рядом три простые фигуры. Можно рисовать их от руки.',
      'Попробуйте другое расположение одной фигуры. На холсте можно нарисовать второй вариант рядом.',
    ],
    prompt: 'Какой вариант хочется оставить?',
  },
  {
    id: 'postcard',
    title: 'Маленькая открытка',
    minutes: 7,
    material: 'color',
    supplies: 'Цветные карандаши или холст',
    steps: [
      'Выберите вещь, место или момент, к которому вам хочется вернуться.',
      'Сделайте для него открытку из нескольких линий и пятен цвета. Если хочется, подпишите её.',
    ],
    prompt: 'Какую деталь открытки хочется запомнить?',
  },
  {
    id: 'day-frame',
    title: 'Кадр из дня',
    minutes: 5,
    material: 'color',
    supplies: 'Бумага и два цвета или холст',
    steps: [
      'Вспомните одну обычную деталь дня, например чашку или свет в окне.',
      'Нарисуйте её двумя цветами. Оставьте рядом столько свободного места, сколько хочется.',
    ],
    prompt: 'Что вы заметили в этой детали, пока рисовали?',
  },
  {
    id: 'shapes-collage',
    title: 'Коллаж из форм',
    minutes: 10,
    material: 'collage',
    supplies: 'Кусочки бумаги или холст',
    steps: [
      'Выберите несколько обрывков бумаги. На холсте нарисуйте отдельные цветные пятна.',
      'Соберите из них композицию. Попробуйте передвинуть один фрагмент или повторить его в другом месте.',
    ],
    prompt: 'Что хочется оставить в центре композиции?',
  },
] as const;

export const practiceCatalog = {
  practices,
  intentions: [
    {
      id: 'free-drawing',
      title: 'Порисовать без темы',
      practiceIds: ['two-lines', 'three-shapes'],
    },
    { id: 'notice-the-day', title: 'Заметить деталь дня', practiceIds: ['day-frame', 'postcard'] },
    {
      id: 'prepare-for-a-meeting',
      title: 'Подготовиться к встрече',
      practiceIds: ['postcard', 'three-shapes'],
    },
  ],
  series: [
    {
      id: 'line-to-collage',
      title: 'От линии к коллажу',
      practiceIds: ['two-lines', 'three-shapes', 'shapes-collage'],
    },
    {
      id: 'details-of-the-day',
      title: 'Детали дня',
      practiceIds: ['day-frame', 'three-shapes', 'postcard'],
    },
  ],
};

export function isPracticeId(id: string): boolean {
  return practices.some((practice) => practice.id === id);
}
