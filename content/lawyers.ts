/**
 * Юристы службы — источник правды по людям, которые ведут дела.
 * Устроен так же, как `content/landings.ts`: добавление юриста = новый объект
 * в `lawyers`, разметку трогать не нужно.
 *
 * ВАЖНО — это НЕ данные организации. От чьего имени оказываются услуги
 * (название, слоган, маркеры доверия) живёт в `content/company.ts`. Юрист и
 * организация — разные сущности: юрист может уйти, статус смениться, состав
 * практики поменяться, а бренд и юрлицо останутся. Не смешивать.
 */

export type LawyerStatus = 'адвокат' | 'юрист';

/**
 * Запись в реестре адвокатов. Есть только у статуса «адвокат» — у юриста без
 * адвокатского статуса реестрового номера не бывает, поэтому поле опционально.
 */
export type LawyerRegistry = {
  /** Реестровый номер, как в удостоверении. */
  number: string;
  /** Адвокатская палата, в реестре которой состоит. */
  chamber: string;
};

/** Личные каналы связи. Не заданы — везде показываются общие из `lib/contacts.ts`. */
export type LawyerContacts = {
  /** Отображаемый вид номера. */
  phone?: string;
  /** Значение для `href`, вида `tel:+7...`. Задавать вместе с `phone`. */
  phoneHref?: string;
  telegram?: string;
  email?: string;
};

export type Lawyer = {
  /** Слаг: латиница, нижний регистр. Будет частью URL личной страницы. */
  id: string;
  /** ФИО полностью, в именительном падеже. */
  fullName: string;
  status: LawyerStatus;
  /** Только для статуса «адвокат». */
  registry?: LawyerRegistry;
  /** Год начала собственной практики. Не путать с годом основания службы. */
  practiceSince: number;
  /**
   * Направления, которые ведёт. Значения — слаги посадочных из
   * `content/landings.ts` (сверяться с `LANDING_SLUGS`). Несуществующий слаг
   * не ломает рендер, но и не свяжет юриста с направлением.
   */
  specializations: string[];
  /** Короткое био: два-три предложения, без перечисления регалий. */
  bio: string;
  /** Путь от корня `public`, например `/lawyers/spirin.jpg`. Пусто — фото не показывается. */
  photo: string;
  contacts?: LawyerContacts;
};

export const lawyers: Record<string, Lawyer> = {
  spirin: {
    id: 'spirin',
    // {{ФАКТ: ФИО полностью, статус в реестре, номер и палата, био, фото}}
    fullName: '',
    status: 'адвокат',
    practiceSince: 2007,
    // Пока юрист один и ведёт все шесть направлений. Появится второй —
    // список у каждого сужается, разметка и хелперы не меняются.
    specializations: [
      'arest-scheta',
      'subsidiarnaya-otvetstvennost',
      'nalogovye-spory',
      'ekonomicheskaya-ugolovka',
      'korporativnye-spory',
      'abonentskoe-obsluzhivanie',
    ],
    bio: '',
    photo: '',
  },
};

/** Порядок объявления в конфиге — он же порядок вывода. */
export const lawyersList: Lawyer[] = Object.values(lawyers);

/** Возвращает `undefined`, если юриста с таким id нет: вызывающий решает, что показать. */
export function getLawyerById(id: string): Lawyer | undefined {
  return lawyers[id];
}

/** Все юристы, ведущие направление. Пустой массив — направление ещё ни за кем не закреплено. */
export function getLawyersBySpecialization(slug: string): Lawyer[] {
  return lawyersList.filter((lawyer) => lawyer.specializations.includes(slug));
}
