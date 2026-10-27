import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // На Render запрос приходит через прокси: адрес клиента — в X-Forwarded-For.
  // Без этого все компьютеры клубов выглядели бы одним адресом для лимита неверных кодов.
  app.set("trust proxy", true);
  app.enableCors();
  app.setGlobalPrefix("api");
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
