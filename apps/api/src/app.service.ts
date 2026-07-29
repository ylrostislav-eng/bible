import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'Bible Arena API',
      status: 'running',
    };
  }
}
