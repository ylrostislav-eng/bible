import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BibleService } from './bible.service';

@UseGuards(JwtAuthGuard)
@Controller('bible')
export class BibleController {
  constructor(private readonly bibleService: BibleService) {}

  @Get(':bookId/:chapter')
  async getChapter(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Param('chapter', ParseIntPipe) chapter: number,
  ) {
    return this.bibleService.getChapter(bookId, chapter);
  }
}
