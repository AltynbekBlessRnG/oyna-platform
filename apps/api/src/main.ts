import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // На Render запрос проходит через один прокси, и адрес клиента он дописывает в X-Forwarded-For.
  // Доверяем ровно одному звену: значения, которые клиент подставил в заголовок сам, не считаются.
  app.set("trust proxy", 1);
  app.enableCors();
  app.setGlobalPrefix("api");
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
