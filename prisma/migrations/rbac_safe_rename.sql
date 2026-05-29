-- Safe RBAC renames: preserve data, avoid drop/create.

-- Tables
ALTER TABLE IF EXISTS "Role" RENAME TO roles;
ALTER TABLE IF EXISTS "UserRole" RENAME TO user_role;
ALTER TABLE IF EXISTS "Permission" RENAME TO permissions;
ALTER TABLE IF EXISTS "RolePermission" RENAME TO roles_permission;

-- roles columns
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.roles RENAME COLUMN "name" TO role;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE public.roles RENAME COLUMN "tenantId" TO tenant_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'createdDate'
  ) THEN
    ALTER TABLE public.roles RENAME COLUMN "createdDate" TO created_date;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'updatedDate'
  ) THEN
    ALTER TABLE public.roles RENAME COLUMN "updatedDate" TO updated_date;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'createdBy'
  ) THEN
    ALTER TABLE public.roles RENAME COLUMN "createdBy" TO created_by;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'updatedBy'
  ) THEN
    ALTER TABLE public.roles RENAME COLUMN "updatedBy" TO updated_by;
  END IF;
END $$;

-- user_role columns
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_role' AND column_name = 'userId'
  ) THEN
    ALTER TABLE public.user_role RENAME COLUMN "userId" TO user_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_role' AND column_name = 'roleId'
  ) THEN
    ALTER TABLE public.user_role RENAME COLUMN "roleId" TO role_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_role' AND column_name = 'createdDate'
  ) THEN
    ALTER TABLE public.user_role RENAME COLUMN "createdDate" TO created_date;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_role' AND column_name = 'updatedDate'
  ) THEN
    ALTER TABLE public.user_role RENAME COLUMN "updatedDate" TO updated_date;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_role' AND column_name = 'createdBy'
  ) THEN
    ALTER TABLE public.user_role RENAME COLUMN "createdBy" TO created_by;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_role' AND column_name = 'updatedBy'
  ) THEN
    ALTER TABLE public.user_role RENAME COLUMN "updatedBy" TO updated_by;
  END IF;
END $$;

-- permissions columns
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'createdDate'
  ) THEN
    ALTER TABLE public.permissions RENAME COLUMN "createdDate" TO created_date;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'updatedDate'
  ) THEN
    ALTER TABLE public.permissions RENAME COLUMN "updatedDate" TO updated_date;
  END IF;
END $$;

-- roles_permission columns
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles_permission' AND column_name = 'roleId'
  ) THEN
    ALTER TABLE public.roles_permission RENAME COLUMN "roleId" TO role_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles_permission' AND column_name = 'permissionId'
  ) THEN
    ALTER TABLE public.roles_permission RENAME COLUMN "permissionId" TO permission_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles_permission' AND column_name = 'createdDate'
  ) THEN
    ALTER TABLE public.roles_permission RENAME COLUMN "createdDate" TO created_date;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles_permission' AND column_name = 'createdBy'
  ) THEN
    ALTER TABLE public.roles_permission RENAME COLUMN "createdBy" TO created_by;
  END IF;
END $$;
