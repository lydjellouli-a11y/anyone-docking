export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      attendance: {
        Row: {
          device_ref: string | null;
          flags: string[];
          id: string;
          institution_id: string;
          recorded_at: string;
          session_id: string;
          source: string;
          status: string;
          student_id: string;
          updated_at: string | null;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          device_ref?: string | null;
          flags?: string[];
          id?: string;
          institution_id: string;
          recorded_at?: string;
          session_id: string;
          source: string;
          status: string;
          student_id: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          device_ref?: string | null;
          flags?: string[];
          id?: string;
          institution_id?: string;
          recorded_at?: string;
          session_id?: string;
          source?: string;
          status?: string;
          student_id?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_institution_id_session_id_fkey";
            columns: ["institution_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "attendance_institution_id_student_id_fkey";
            columns: ["institution_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["institution_id", "id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          institution_id: string;
          new_values: Json | null;
          old_values: Json | null;
          reason: string | null;
          row_pk: string | null;
          session_id: string | null;
          table_name: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          institution_id: string;
          new_values?: Json | null;
          old_values?: Json | null;
          reason?: string | null;
          row_pk?: string | null;
          session_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          institution_id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
          reason?: string | null;
          row_pk?: string | null;
          session_id?: string | null;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      checkin_attempts: {
        Row: {
          created_at: string;
          device_ref: string | null;
          id: number;
          institution_id: string | null;
          ip_hash: string | null;
          matricule_hash: string | null;
          result: string;
          session_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          device_ref?: string | null;
          id?: never;
          institution_id?: string | null;
          ip_hash?: string | null;
          matricule_hash?: string | null;
          result: string;
          session_id?: string | null;
        };
        Update: {
          created_at?: string;
          device_ref?: string | null;
          id?: never;
          institution_id?: string | null;
          ip_hash?: string | null;
          matricule_hash?: string | null;
          result?: string;
          session_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "checkin_attempts_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkin_attempts_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      class_sessions: {
        Row: {
          assignment_id: string;
          checkin_closes_at: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          fallback_code: string | null;
          id: string;
          institution_id: string;
          opened_at: string | null;
          public_code: string;
          room: string | null;
          scheduled_at: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          assignment_id: string;
          checkin_closes_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          fallback_code?: string | null;
          id?: string;
          institution_id: string;
          opened_at?: string | null;
          public_code?: string;
          room?: string | null;
          scheduled_at: string;
          status?: string;
        };
        Update: {
          assignment_id?: string;
          checkin_closes_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          fallback_code?: string | null;
          id?: string;
          institution_id?: string;
          opened_at?: string | null;
          public_code?: string;
          room?: string | null;
          scheduled_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_sessions_institution_id_assignment_id_fkey";
            columns: ["institution_id", "assignment_id"];
            isOneToOne: false;
            referencedRelation: "teaching_assignments";
            referencedColumns: ["institution_id", "id"];
          },
        ];
      };
      departments: {
        Row: {
          created_at: string;
          id: string;
          institution_id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          institution_id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          institution_id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      group_students: {
        Row: {
          created_at: string;
          group_id: string;
          institution_id: string;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id: string;
          institution_id: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          institution_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_students_institution_id_group_id_fkey";
            columns: ["institution_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "group_students_institution_id_student_id_fkey";
            columns: ["institution_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["institution_id", "id"];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          department_id: string | null;
          id: string;
          institution_id: string;
          kind: string;
          level: string | null;
          name: string;
          parent_id: string | null;
          semester_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          department_id?: string | null;
          id?: string;
          institution_id: string;
          kind?: string;
          level?: string | null;
          name: string;
          parent_id?: string | null;
          semester_id: string;
        };
        Update: {
          created_at?: string;
          department_id?: string | null;
          id?: string;
          institution_id?: string;
          kind?: string;
          level?: string | null;
          name?: string;
          parent_id?: string | null;
          semester_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_institution_id_department_id_fkey";
            columns: ["institution_id", "department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "groups_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_institution_id_semester_id_fkey";
            columns: ["institution_id", "semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "groups_parent_fk";
            columns: ["institution_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["institution_id", "id"];
          },
        ];
      };
      institutions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          retention_months: number;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          retention_months?: number;
          timezone?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          retention_months?: number;
          timezone?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          created_at: string;
          department_id: string | null;
          institution_id: string;
          role: string;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          department_id?: string | null;
          institution_id: string;
          role: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          department_id?: string | null;
          institution_id?: string;
          role?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_institution_id_department_id_fkey";
            columns: ["institution_id", "department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "memberships_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      modules: {
        Row: {
          code: string;
          created_at: string;
          department_id: string | null;
          id: string;
          institution_id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          institution_id: string;
          name: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          institution_id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modules_institution_id_department_id_fkey";
            columns: ["institution_id", "department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "modules_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      semesters: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          institution_id: string;
          label: string;
          start_date: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          institution_id: string;
          label: string;
          start_date: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          institution_id?: string;
          label?: string;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "semesters_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      session_tokens: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          institution_id: string;
          session_id: string;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          institution_id: string;
          session_id: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          institution_id?: string;
          session_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_tokens_institution_id_session_id_fkey";
            columns: ["institution_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["institution_id", "id"];
          },
        ];
      };
      students: {
        Row: {
          active: boolean;
          created_at: string;
          first_name: string;
          id: string;
          institution_id: string;
          last_name: string;
          matricule: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          first_name: string;
          id?: string;
          institution_id: string;
          last_name: string;
          matricule: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          first_name?: string;
          id?: string;
          institution_id?: string;
          last_name?: string;
          matricule?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      teaching_assignments: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          institution_id: string;
          module_id: string;
          session_type: string;
          teacher_id: string;
          teacher_role: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          institution_id: string;
          module_id: string;
          session_type: string;
          teacher_id: string;
          teacher_role?: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          institution_id?: string;
          module_id?: string;
          session_type?: string;
          teacher_id?: string;
          teacher_role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_assignments_institution_id_group_id_fkey";
            columns: ["institution_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "teaching_assignments_institution_id_module_id_fkey";
            columns: ["institution_id", "module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["institution_id", "id"];
          },
          {
            foreignKeyName: "teaching_assignments_institution_id_teacher_id_teacher_rol_fkey";
            columns: ["institution_id", "teacher_id", "teacher_role"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["institution_id", "user_id", "role"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cancel_session: { Args: { p_session_id: string }; Returns: undefined };
      close_session: { Args: { p_session_id: string }; Returns: Json };
      create_workspace: { Args: { p_name: string }; Returns: string };
      extend_checkin: {
        Args: { p_minutes?: number; p_session_id: string };
        Returns: string;
      };
      import_students: {
        Args: { p_group_id: string; p_rows: Json };
        Returns: Json;
      };
      open_session: {
        Args: { p_minutes?: number; p_session_id: string };
        Returns: undefined;
      };
      record_checkin: {
        Args: {
          p_device_ref: string;
          p_ip_hash: string;
          p_matricule: string;
          p_session_id: string;
          p_source: string;
        };
        Returns: Json;
      };
      rotate_session_token: {
        Args: { p_session_id: string };
        Returns: {
          checkin_closes_at: string;
          expires_at: string;
          server_now: string;
          token: string;
        }[];
      };
      set_attendance: {
        Args: {
          p_reason: string;
          p_session_id: string;
          p_status: string;
          p_student_id: string;
        };
        Returns: undefined;
      };
      validate_scan: {
        Args: {
          p_device_ref: string;
          p_fallback_code: string;
          p_ip_hash: string;
          p_public_code: string;
          p_token: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
