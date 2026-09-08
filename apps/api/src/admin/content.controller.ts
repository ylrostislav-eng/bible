import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CONTENT_KIND_LABELS,
  type ContentItem,
  type ContentKind,
} from '@bible-arena/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard, GameMasterGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { AdminService } from './admin.service';
import { ContentService } from './content.service';
import { ContentPatchDto } from './dto/content.dto';

/**
 * Правка содержимого: вопросы, ответы, слова.
 *
 * Отдельный контроллер, а не ещё десяток методов в админском: тот про
 * людей и партии, этот — про банк вопросов, и смешивать их значит
 * получить файл, который открывают с поиском.
 *
 * Правит администратор и выше — это обратимо и делается тем, кто увидел
 * ошибку. Удаление отдано гейм-мастеру: вопрос главы и слово исчезают
 * насовсем.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/content')
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly admin: AdminService,
  ) {}

  @Get(':kind')
  list(
    @Param('kind') kind: ContentKind,
    @Query('q') q?: string,
    @Query('bookId') bookId?: string,
    @Query('chapter') chapter?: string,
  ) {
    return this.content.list({
      kind,
      query: q ?? '',
      bookId: bookId ? Number(bookId) : undefined,
      chapter: chapter ? Number(chapter) : undefined,
    });
  }

  @Get(':kind/:id')
  item(@Param('kind') kind: ContentKind, @Param('id') id: string) {
    return this.content.item(kind, id);
  }

  @Patch(':kind/:id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('kind') kind: ContentKind,
    @Param('id') id: string,
    @Body() dto: ContentPatchDto,
  ): Promise<ContentItem> {
    const actor = await this.admin.identify(user.sub);
    const { item, changed } = await this.content.update(kind, id, dto);

    // Пустой список изменений — обычное дело: форму открыли, посмотрели и
    // сохранили не меняя. Записывать такое в журнал значит топить в нём
    // настоящие правки.
    if (changed.length > 0) {
      await this.admin.logContent(
        actor,
        'EDIT_CONTENT',
        `${CONTENT_KIND_LABELS[kind]}: ${title(item)} — ${changed.join(', ')}`,
      );
    }
    return item;
  }

  @Post(':kind')
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('kind') kind: ContentKind,
    @Body() dto: ContentPatchDto,
  ): Promise<ContentItem> {
    const actor = await this.admin.identify(user.sub);
    const item = await this.content.create(kind, dto);
    await this.admin.logContent(
      actor,
      'CREATE_CONTENT',
      `${CONTENT_KIND_LABELS[kind]}: ${title(item)}`,
    );
    return item;
  }

  /** Необратимо для вопроса главы и слова, поэтому у гейм-мастера. Вопрос
   * игры при этом не удаляется, а уходит в черновик — см. сервис. */
  @UseGuards(GameMasterGuard)
  @Delete(':kind/:id')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('kind') kind: ContentKind,
    @Param('id') id: string,
  ): Promise<void> {
    const actor = await this.admin.identify(user.sub);
    const { title: removed } = await this.content.remove(kind, id);
    await this.admin.logContent(
      actor,
      'DELETE_CONTENT',
      `${CONTENT_KIND_LABELS[kind]}: ${removed}`,
    );
  }
}

/** Короткая подпись карточки для журнала: длинный вопрос целиком делает
 * строку журнала нечитаемой. */
function title(item: ContentItem): string {
  const text = item.kind === 'ALIAS_WORD' ? item.word : item.text;
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}
