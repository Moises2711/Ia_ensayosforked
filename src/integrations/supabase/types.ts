export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      perfil_usuario: {
        Row: {
          ai_difficulty: number;
          allow_improv: boolean;
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          feedback_enabled: boolean;
          notifications_enabled: boolean;
          offline_mode_enabled: boolean;
          preferred_voice: string;
          privacy_level: string;
          rehearsal_mode: string;
          suggest_emotions: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_difficulty?: number;
          allow_improv?: boolean;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          feedback_enabled?: boolean;
          notifications_enabled?: boolean;
          offline_mode_enabled?: boolean;
          preferred_voice?: string;
          privacy_level?: string;
          rehearsal_mode?: string;
          suggest_emotions?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ai_difficulty?: number;
          allow_improv?: boolean;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          feedback_enabled?: boolean;
          notifications_enabled?: boolean;
          offline_mode_enabled?: boolean;
          preferred_voice?: string;
          privacy_level?: string;
          rehearsal_mode?: string;
          suggest_emotions?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      scripts: {
        Row: {
          act_count: number;
          author: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          genre: string | null;
          id: string;
          imported_at: string | null;
          is_active: boolean;
          is_favorite: boolean;
          is_public: boolean;
          raw_text: string | null;
          source_type: string;
          title: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          act_count?: number;
          author?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          genre?: string | null;
          id?: string;
          imported_at?: string | null;
          is_active?: boolean;
          is_favorite?: boolean;
          is_public?: boolean;
          raw_text?: string | null;
          source_type?: string;
          title: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          act_count?: number;
          author?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          genre?: string | null;
          id?: string;
          imported_at?: string | null;
          is_active?: boolean;
          is_favorite?: boolean;
          is_public?: boolean;
          raw_text?: string | null;
          source_type?: string;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      scenes: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          location: string | null;
          script_id: string;
          sort_order: number;
          title: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          script_id: string;
          sort_order?: number;
          title: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          script_id?: string;
          sort_order?: number;
          title?: string;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          actor_type: string;
          base_emotion: string | null;
          created_at: string;
          id: string;
          name: string;
          role: string | null;
          script_id: string;
          sort_order: number;
          voice: string | null;
        };
        Insert: {
          actor_type?: string;
          base_emotion?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          role?: string | null;
          script_id: string;
          sort_order?: number;
          voice?: string | null;
        };
        Update: {
          actor_type?: string;
          base_emotion?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          role?: string | null;
          script_id?: string;
          sort_order?: number;
          voice?: string | null;
        };
        Relationships: [];
      };
      script_lines: {
        Row: {
          character_id: string | null;
          created_at: string;
          cue: string | null;
          duration_seconds: number;
          id: string;
          line_order: number;
          scene_id: string;
          text: string;
        };
        Insert: {
          character_id?: string | null;
          created_at?: string;
          cue?: string | null;
          duration_seconds?: number;
          id?: string;
          line_order: number;
          scene_id: string;
          text: string;
        };
        Update: {
          character_id?: string | null;
          created_at?: string;
          cue?: string | null;
          duration_seconds?: number;
          id?: string;
          line_order?: number;
          scene_id?: string;
          text?: string;
        };
        Relationships: [];
      };
      rehearsal_sessions: {
        Row: {
          ai_difficulty: number;
          allow_improv: boolean;
          clarity_score: number | null;
          completed_lines: number;
          ended_at: string | null;
          expression_score: number | null;
          feedback_summary: string | null;
          feedback_enabled: boolean;
          id: string;
          memorization_score: number | null;
          mode: string;
          projection_score: number | null;
          repeated_lines: number;
          rhythm_score: number | null;
          scene_id: string | null;
          score: number | null;
          selected_character_id: string | null;
          script_id: string | null;
          skipped_lines: number;
          started_at: string;
          status: string;
          suggest_emotions: boolean;
          teleprompter_last_event: string | null;
          teleprompter_session_id: string | null;
          teleprompter_status: string;
          total_lines: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          ai_difficulty?: number;
          allow_improv?: boolean;
          clarity_score?: number | null;
          completed_lines?: number;
          ended_at?: string | null;
          expression_score?: number | null;
          feedback_summary?: string | null;
          feedback_enabled?: boolean;
          id?: string;
          memorization_score?: number | null;
          mode?: string;
          projection_score?: number | null;
          repeated_lines?: number;
          rhythm_score?: number | null;
          scene_id?: string | null;
          score?: number | null;
          selected_character_id?: string | null;
          script_id?: string | null;
          skipped_lines?: number;
          started_at?: string;
          status?: string;
          suggest_emotions?: boolean;
          teleprompter_last_event?: string | null;
          teleprompter_session_id?: string | null;
          teleprompter_status?: string;
          total_lines?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          ai_difficulty?: number;
          allow_improv?: boolean;
          clarity_score?: number | null;
          completed_lines?: number;
          ended_at?: string | null;
          expression_score?: number | null;
          feedback_summary?: string | null;
          feedback_enabled?: boolean;
          id?: string;
          memorization_score?: number | null;
          mode?: string;
          projection_score?: number | null;
          repeated_lines?: number;
          rhythm_score?: number | null;
          scene_id?: string | null;
          score?: number | null;
          selected_character_id?: string | null;
          script_id?: string | null;
          skipped_lines?: number;
          started_at?: string;
          status?: string;
          suggest_emotions?: boolean;
          teleprompter_last_event?: string | null;
          teleprompter_session_id?: string | null;
          teleprompter_status?: string;
          total_lines?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      rehearsal_highlights: {
        Row: {
          created_at: string;
          event_time: string;
          id: string;
          note: string;
          session_id: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          event_time: string;
          id?: string;
          note: string;
          session_id: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          event_time?: string;
          id?: string;
          note?: string;
          session_id?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      teleprompter_recordings: {
        Row: {
          audio_url: string | null;
          character_name: string;
          created_at: string;
          duration_sec: number | null;
          id: string;
          recording_id: string | null;
          rehearsal_session_id: string;
          segment_index: number;
          segment_text: string | null;
          teleprompter_session_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          audio_url?: string | null;
          character_name: string;
          created_at?: string;
          duration_sec?: number | null;
          id?: string;
          recording_id?: string | null;
          rehearsal_session_id: string;
          segment_index: number;
          segment_text?: string | null;
          teleprompter_session_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          audio_url?: string | null;
          character_name?: string;
          created_at?: string;
          duration_sec?: number | null;
          id?: string;
          recording_id?: string | null;
          rehearsal_session_id?: string;
          segment_index?: number;
          segment_text?: string | null;
          teleprompter_session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
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

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
