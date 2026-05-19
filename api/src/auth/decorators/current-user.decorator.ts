import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: Record<string, unknown> }>();
    // JWT strategy sets user.sub — map sub → id for convenience
    const user = request.user;
    if (!user) return null;
    return { ...user, id: user['sub'] as string };
  },
);
