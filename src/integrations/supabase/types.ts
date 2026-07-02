export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Relationships: []
      }
      banks: {
        Row: {
          account_name: string
          account_number: string
          country: string | null
          created_at: string
          currency: string
          iban: string | null
          id: string
          instructions: string | null
          is_active: boolean
          logo_url: string | null
          name: string
          swift: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          country?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          logo_url?: string | null
          name: string
          swift?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          country?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          logo_url?: string | null
          name?: string
          swift?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          entry_fee: number
          game_id: string
          id: string
          opponent_id: string | null
          prize: number
          rules: string | null
          status: Database["public"]["Enums"]["challenge_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          entry_fee?: number
          game_id: string
          id?: string
          opponent_id?: string | null
          prize?: number
          rules?: string | null
          status?: Database["public"]["Enums"]["challenge_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          entry_fee?: number
          game_id?: string
          id?: string
          opponent_id?: string | null
          prize?: number
          rules?: string | null
          status?: Database["public"]["Enums"]["challenge_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          admin_note: string | null
          amount: number
          bank_id: string
          created_at: string
          currency: string
          id: string
          processed_at: string | null
          processed_by: string | null
          proof_url: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          bank_id: string
          created_at?: string
          currency?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          proof_url: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          bank_id?: string
          created_at?: string
          currency?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          proof_url?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          opened_by: string
          reason: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          opened_by: string
          reason?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          opened_by?: string
          reason?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_results: {
        Row: {
          challenge_id: string
          claimed_winner: string | null
          created_at: string
          id: string
          proof_url: string | null
          score: string | null
          status: Database["public"]["Enums"]["match_result_status"]
          submitted_by: string
        }
        Insert: {
          challenge_id: string
          claimed_winner?: string | null
          created_at?: string
          id?: string
          proof_url?: string | null
          score?: string | null
          status?: Database["public"]["Enums"]["match_result_status"]
          submitted_by: string
        }
        Update: {
          challenge_id?: string
          claimed_winner?: string | null
          created_at?: string
          id?: string
          proof_url?: string | null
          score?: string | null
          status?: Database["public"]["Enums"]["match_result_status"]
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_results_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          image_url: string | null
          is_read: boolean
          message: string | null
          message_type: string
          sender_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_read?: boolean
          message?: string | null
          message_type?: string
          sender_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_read?: boolean
          message?: string | null
          message_type?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      prediction_entries: {
        Row: {
          amount: number
          chosen_option: string
          created_at: string
          id: string
          is_winner: boolean | null
          payout: number | null
          prediction_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          chosen_option: string
          created_at?: string
          id?: string
          is_winner?: boolean | null
          payout?: number | null
          prediction_id: string
          user_id: string
        }
        Update: {
          amount?: number
          chosen_option?: string
          created_at?: string
          id?: string
          is_winner?: boolean | null
          payout?: number | null
          prediction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_entries_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          closes_at: string | null
          correct_option: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          entry_fee: number
          id: string
          image_url: string | null
          options: Json
          prize_pool: number
          status: Database["public"]["Enums"]["prediction_status"]
          title: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          correct_option?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          entry_fee?: number
          id?: string
          image_url?: string | null
          options: Json
          prize_pool?: number
          status?: Database["public"]["Enums"]["prediction_status"]
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          correct_option?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          entry_fee?: number
          id?: string
          image_url?: string | null
          options?: Json
          prize_pool?: number
          status?: Database["public"]["Enums"]["prediction_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          level: number
          losses: number
          rank_points: number
          updated_at: string
          username: string
          wins: number
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          level?: number
          losses?: number
          rank_points?: number
          updated_at?: string
          username: string
          wins?: number
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          level?: number
          losses?: number
          rank_points?: number
          updated_at?: string
          username?: string
          wins?: number
          xp?: number
        }
        Relationships: []
      }
      tournament_participants: {
        Row: {
          id: string
          joined_at: string
          placement: number | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          placement?: number | null
          tournament_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          placement?: number | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          banner_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          ends_at: string | null
          entry_fee: number
          game_id: string
          id: string
          max_players: number
          prize_pool: number
          starts_at: string | null
          status: Database["public"]["Enums"]["tournament_status"]
          title: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          ends_at?: string | null
          entry_fee?: number
          game_id: string
          id?: string
          max_players?: number
          prize_pool?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          title: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          ends_at?: string | null
          entry_fee?: number
          game_id?: string
          id?: string
          max_players?: number
          prize_pool?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          status: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          locked_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          account_holder: string
          account_number: string
          admin_note: string | null
          amount: number
          bank_name: string | null
          created_at: string
          currency: string
          id: string
          method: string
          processed_at: string | null
          processed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder: string
          account_number: string
          admin_note?: string | null
          amount: number
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          method: string
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder?: string
          account_number?: string
          admin_note?: string | null
          amount?: number
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          method?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_challenge_participant: {
        Args: { _challenge_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "admin" | "moderator"
      challenge_status:
        | "open"
        | "accepted"
        | "in_progress"
        | "awaiting_confirmation"
        | "disputed"
        | "completed"
        | "cancelled"
      dispute_status: "open" | "under_review" | "resolved" | "closed"
      match_result_status: "pending" | "confirmed" | "disputed" | "resolved"
      prediction_status: "open" | "closed" | "settled" | "cancelled"
      request_status: "pending" | "approved" | "rejected" | "cancelled"
      tournament_status:
        | "draft"
        | "open"
        | "in_progress"
        | "completed"
        | "cancelled"
      tx_status: "pending" | "completed" | "failed" | "cancelled"
      tx_type:
        | "deposit"
        | "withdrawal"
        | "challenge_entry"
        | "challenge_win"
        | "tournament_entry"
        | "tournament_prize"
        | "prediction_entry"
        | "prediction_win"
        | "refund"
        | "adjustment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin", "moderator"],
      challenge_status: [
        "open",
        "accepted",
        "in_progress",
        "awaiting_confirmation",
        "disputed",
        "completed",
        "cancelled",
      ],
      dispute_status: ["open", "under_review", "resolved", "closed"],
      match_result_status: ["pending", "confirmed", "disputed", "resolved"],
      prediction_status: ["open", "closed", "settled", "cancelled"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      tournament_status: [
        "draft",
        "open",
        "in_progress",
        "completed",
        "cancelled",
      ],
      tx_status: ["pending", "completed", "failed", "cancelled"],
      tx_type: [
        "deposit",
        "withdrawal",
        "challenge_entry",
        "challenge_win",
        "tournament_entry",
        "tournament_prize",
        "prediction_entry",
        "prediction_win",
        "refund",
        "adjustment",
      ],
    },
  },
} as const
